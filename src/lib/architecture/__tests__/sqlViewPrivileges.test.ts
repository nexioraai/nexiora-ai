import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// ============================================================
// DEBT-073 -- UNE VUE PUBLIQUE NE NAIT PAS INOFFENSIVE.
//
// CE QUE CE CLIQUET EXISTE POUR EMPECHER. Supabase pose
// `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES`, et `ON TABLES` couvre
// AUSSI les vues : toute vue creee dans `public` nait avec
// INSERT/UPDATE/DELETE pour `anon` et `authenticated`. Un `GRANT SELECT`
// n'annule rien -- il AJOUTE.
//
// `sites_public` en a porte les consequences : AUTO-MODIFIABLE (une seule
// relation dans son FROM) et en `security_invoker = false`, ses ecritures
// s'executaient avec les droits du proprietaire -- RLS de `sites` contournee,
// grants de colonnes du LOT G contournes. Un visiteur ANONYME pouvait modifier
// ou supprimer les trois vitrines publiees. Le defaut a vecu du 2026-08-21 au
// 2026-08-26 sans qu'aucun controle ne puisse le voir : les cinq boucles ET
// les cinq verifications de `phase2_privileges_hardening.sql` filtrent
// `relkind = 'r'`.
//
// POURQUOI UN TEST, ET PAS SEULEMENT DU SQL. `views_privileges_hardening.sql`
// ferme l'etat present et le defaut par defaut. Il ne peut rien contre un
// fichier ECRIT PLUS TARD qui reprendrait le patron defectueux. Ce cliquet, si.
//
// CE QU'IL NE PREND PAS POUR ARGENT COMPTANT : il ne lit pas la base -- il lit
// les FICHIERS de `supabase/sql/`, qui sont la seule source versionnee de ce
// que le projet declare deployer.
// ============================================================

const SQL_DIR = join(__dirname, '..', '..', '..', '..', 'supabase', 'sql');

/** Retire les commentaires `--` : « CREATE OR REPLACE VIEW » cite dans une
 *  explication n'est pas une instruction. */
const sansCommentaires = (s: string) =>
  s.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

const FICHIERS = readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'));

type Creation = { fichier: string; vue: string; iCreate: number; code: string };

const CREATIONS: Creation[] = [];
for (const f of FICHIERS) {
  const code = sansCommentaires(readFileSync(join(SQL_DIR, f), 'utf-8'));
  for (const m of code.matchAll(/create\s+or\s+replace\s+view\s+public\.(\w+)/gi)) {
    CREATIONS.push({ fichier: f, vue: m[1], iCreate: m.index ?? 0, code });
  }
}

describe('DEBT-073 — toute vue publique de `supabase/sql/` est bornée en écriture', () => {
  it('le dénominateur est réel : des fichiers SQL existent et créent des vues', () => {
    expect(FICHIERS.length).toBeGreaterThan(30);
    expect(CREATIONS.length).toBeGreaterThanOrEqual(3);
    expect(CREATIONS.map((c) => c.vue)).toContain('sites_public');
    expect(CREATIONS.map((c) => c.vue)).toContain('site_blog_posts_public');
  });

  it('chaque création de vue est accompagnée d’un `REVOKE … FROM anon, authenticated`', () => {
    const manquants = CREATIONS.filter(
      (c) => !new RegExp(`revoke\\s+all\\s+on\\s+(?:table\\s+)?public\\.${c.vue}\\s+from[^;]*anon`, 'i').test(c.code)
    ).map((c) => `${c.fichier} → public.${c.vue}`);

    expect(
      manquants,
      manquants.length
        ? `Vue(s) créée(s) sans REVOKE :\n  ${manquants.join('\n  ')}\n\n` +
          `Supabase accorde ALL par défaut sur tout nouvel objet de \`public\`, VUES COMPRISES. ` +
          `Un \`GRANT SELECT\` seul laisse INSERT/UPDATE/DELETE en place — c'est le défaut DEBT-073, ` +
          `qui a rendu \`sites_public\` écrivable par \`anon\`. Poser :\n` +
          `  REVOKE ALL ON public.<vue> FROM anon, authenticated;\n` +
          `  GRANT SELECT ON public.<vue> TO anon, authenticated;`
        : undefined
    ).toEqual([]);
  });

  it('le `REVOKE` précède toujours le `GRANT` — l’ordre inverse ne protégerait rien', () => {
    for (const c of CREATIONS) {
      const iRevoke = c.code.search(new RegExp(`revoke\\s+all\\s+on\\s+(?:table\\s+)?public\\.${c.vue}`, 'i'));
      const iGrant = c.code.search(new RegExp(`grant\\s+select\\s+on\\s+(?:table\\s+)?public\\.${c.vue}`, 'i'));
      if (iGrant === -1) continue; // vue non exposée : rien à ordonner
      expect(iRevoke, `${c.fichier} → ${c.vue} : REVOKE absent`).toBeGreaterThan(-1);
      expect(iRevoke, `${c.fichier} → ${c.vue} : REVOKE doit précéder GRANT`).toBeLessThan(iGrant);
    }
  });

  it('aucune vue n’accorde autre chose que `SELECT` à anon/authenticated', () => {
    for (const c of CREATIONS) {
      const grants = c.code.match(
        new RegExp(`grant\\s+([a-z, ]+?)\\s+on\\s+(?:table\\s+)?public\\.${c.vue}\\s+to[^;]*(?:anon|authenticated)`, 'gi')
      ) ?? [];
      for (const g of grants) {
        expect(g.toLowerCase(), `${c.fichier} → ${c.vue}`).toMatch(/grant\s+select\s+on/);
      }
    }
  });
});

describe('DEBT-073 — le durcissement des vues est versionné et reste restrictif', () => {
  const F = 'views_privileges_hardening.sql';
  const brut = readFileSync(join(SQL_DIR, F), 'utf-8');
  const code = sansCommentaires(brut);

  it('le fichier existe et couvre `relkind IN (\'v\',\'m\')` — pas seulement les tables', () => {
    expect(FICHIERS).toContain(F);
    expect(code).toMatch(/relkind\s+IN\s*\(\s*'v'\s*,\s*'m'\s*\)/i);
  });

  it('il ne pose AUCUN `GRANT` — il ne peut donc rien ouvrir', () => {
    expect(code).not.toMatch(/\bGRANT\b/i);
  });

  it('il conserve `SELECT` : une vue publique existe pour être lue', () => {
    expect(code).toMatch(/privilege_type\s*<>\s*'SELECT'/i);
  });

  it('il ne touche AUCUNE table : ni policy, ni donnée, ni `relkind = \'r\'` en EXÉCUTION', () => {
    // La contrainte porte sur les blocs EXÉCUTABLES. La section de
    // vérification, elle, interroge légitimement `relkind = 'r'` : c'est même
    // elle qui PROUVE qu'aucune table n'a bougé. Confondre les deux ferait
    // échouer le fichier sur sa propre preuve.
    const iVerif = code.search(/SELECT c\.relname\s+AS "table"/i);
    expect(iVerif, 'section de vérification introuvable').toBeGreaterThan(-1);
    const executable = code.slice(0, code.search(/SELECT c\.relname\s+AS vue/i));

    expect(executable).not.toMatch(/relkind\s*=\s*'r'/i);
    expect(executable).not.toMatch(/\b(INSERT INTO|UPDATE .* SET|DELETE FROM|DROP POLICY|CREATE POLICY|ALTER POLICY)\b/i);
    // Les deux seules instructions exécutées sont un REVOKE et un
    // ALTER DEFAULT PRIVILEGES ... REVOKE.
    for (const f of executable.match(/EXECUTE format\(([\s\S]*?)\)/g) ?? []) {
      expect(f, 'instruction exécutée inattendue').toMatch(/REVOKE/i);
    }
  });

  it('la cause est traitée par rôle créateur DÉCOUVERT, jamais en dur', () => {
    // Un `ALTER DEFAULT PRIVILEGES` sans `FOR ROLE` ne vise que le rôle
    // courant : si Supabase a posé le sien pour un autre rôle, l'instruction
    // paraîtrait réussir sans rien changer.
    expect(code).toMatch(/pg_default_acl/);
    expect(code).toMatch(/FOR ROLE %I/);
  });

  it('`phase2` renvoie vers ce fichier, et n’a pas été modifié dans ses instructions', () => {
    const phase2 = readFileSync(join(SQL_DIR, 'phase2_privileges_hardening.sql'), 'utf-8');
    expect(phase2).toContain('views_privileges_hardening.sql');
    // Ses cinq boucles restent en `relkind = 'r'` : il documente son époque.
    expect((sansCommentaires(phase2).match(/relkind\s*=\s*'r'/gi) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
