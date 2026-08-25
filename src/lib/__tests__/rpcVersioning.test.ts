import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// ============================================================
// M2-09 — TOUTE RPC APPELEE PAR LE CODE DOIT AVOIR UN SCRIPT VERSIONNE.
//
// LE CONSTAT MESURE PENDANT L'AUDIT MODE 2 : 12 RPC appelees, 19 fonctions
// definies dans `supabase/sql/`, **19 sur 19 portant un REVOKE explicite** --
// et exactement UNE fonction appelee sans definition versionnee,
// `consume_promo_code`, invoquee sur toute commande comportant un code promo.
//
// CE QUE CELA COUTE. Une base recreee depuis ce depot n'aurait pas la
// fonction ; personne ne peut relire ici ce qu'elle fait ni qui peut
// l'appeler. Le patron REVOKE/GRANT applique partout ailleurs n'y est ni
// verifiable ni reproductible.
//
// CE CLIQUET NE CORRIGE PAS L'OMISSION -- il l'empeche de se multiplier et la
// rend datee. Une RPC ajoutee demain sans script echoue le jour ou elle est
// appelee. L'exception restante porte sa raison et son etat de mesure : la
// retirer sera possible des que la definition aura ete extraite de la base.
// ============================================================

const RACINE = join(__dirname, '../../..');

function fichiers(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === 'node_modules') continue;
      out.push(...fichiers(p, ext));
    } else if (ext.test(e)) out.push(p);
  }
  return out;
}

const sansCommentairesJs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const sansCommentairesSql = (s: string) => s.replace(/^\s*--.*$/gm, ' ');

/** Les RPC réellement invoquées par le code applicatif (hors tests). */
const APPELEES = (() => {
  const noms = new Set<string>();
  for (const f of fichiers(join(RACINE, 'src'), /\.tsx?$/)) {
    if (f.includes('__tests__') || /\.test\.tsx?$/.test(f)) continue;
    for (const m of sansCommentairesJs(readFileSync(f, 'utf-8')).matchAll(/\.rpc\(\s*'([a-z_]+)'/g)) {
      noms.add(m[1]);
    }
  }
  return noms;
})();

/** Les fonctions dont la définition vit dans le dépôt. */
const VERSIONNEES = (() => {
  const noms = new Set<string>();
  for (const f of fichiers(join(RACINE, 'supabase/sql'), /\.sql$/)) {
    const code = sansCommentairesSql(readFileSync(f, 'utf-8'));
    for (const m of code.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_]+)\s*\(/gi)) {
      noms.add(m[1].toLowerCase());
    }
  }
  return noms;
})();

/**
 * EXCEPTIONS — chacune porte sa raison et son etat de mesure. Une entree sans
 * justification est exactement ce que ce fichier existe pour empecher.
 */
const NON_VERSIONNEES_ADMISES: Record<string, string> = {
  consume_promo_code:
    'M2-09 (2026-08-25) — definition presente uniquement en base ; la reecrire ' +
    'de memoire remplacerait en production une fonction qu’on ne peut pas relire. ' +
    'Sonde adversariale anon : 42501 permission denied (protegee). Role ' +
    '`authenticated` NON MESURE — aucun JWT utilisateur disponible. Extraction et ' +
    'durcissement prepares dans supabase/sql/consume_promo_code_versioning.sql, ' +
    'non executes : DDL indisponible depuis cet environnement.',
};

// ------------------------------------------------------------
describe('M2-09 — le denominateur est reel', () => {
  it('des RPC sont reellement detectees des deux cotes', () => {
    expect(APPELEES.size).toBeGreaterThanOrEqual(10);
    expect(VERSIONNEES.size).toBeGreaterThanOrEqual(15);
  });

  it('des temoins connus sont bien vus', () => {
    expect([...APPELEES]).toContain('consume_promo_code');
    expect([...APPELEES]).toContain('decrement_shop_stock_batch');
    expect([...VERSIONNEES]).toContain('decrement_shop_stock_batch');
  });
});

// ------------------------------------------------------------
describe('M2-09 — 🔴 toute RPC appelee a un script versionne', () => {
  it('aucune RPC appelee n’echappe au depot ET a l’allowlist', () => {
    const orphelines = [...APPELEES]
      .filter((n) => !VERSIONNEES.has(n) && !(n in NON_VERSIONNEES_ADMISES))
      .sort();
    expect(
      orphelines,
      `RPC appelee(s) par le code sans definition dans supabase/sql/ :\n  ${orphelines.join('\n  ')}\n\n` +
      'CONDUITE A TENIR : versionner la fonction, ou l’inscrire dans ' +
      'NON_VERSIONNEES_ADMISES avec sa raison et son etat de mesure. Une ' +
      'exemption sans raison ecrite est ce que ce test existe pour empecher.'
    ).toEqual([]);
  });

  it('chaque exception porte une raison substantielle', () => {
    for (const [nom, raison] of Object.entries(NON_VERSIONNEES_ADMISES)) {
      expect(raison.trim().length, `${nom} : raison trop courte`).toBeGreaterThan(80);
      expect(APPELEES, `${nom} : inscrit mais jamais appele`).toContain(nom);
    }
  });

  it('🔴 l’allowlist reste minuscule — une seule exception aujourd’hui', () => {
    // Ce n'est pas une cible, c'est un declencheur de revue. L'elargir doit
    // etre un acte visible en diff.
    expect(Object.keys(NON_VERSIONNEES_ADMISES)).toHaveLength(1);
  });
});

// ------------------------------------------------------------
describe('M2-09 — 🔒 le patron de privilege est tenu partout ailleurs', () => {
  const TOUT_LE_SQL = fichiers(join(RACINE, 'supabase/sql'), /\.sql$/)
    .map((f) => sansCommentairesSql(readFileSync(f, 'utf-8')))
    .join('\n');

  it('chaque fonction versionnee porte un REVOKE explicite', () => {
    const sans = [...VERSIONNEES]
      .filter((f) => !new RegExp(`revoke\\s+(all|execute)[^;]*function[^;]*\\b${f}\\b`, 'i').test(TOUT_LE_SQL))
      .sort();
    expect(sans, 'fonction(s) versionnee(s) sans REVOKE — PostgreSQL accorde EXECUTE a PUBLIC par defaut').toEqual([]);
  });

  it('le script d’extraction prepare existe et ne redefinit RIEN', () => {
    const sql = readFileSync(join(RACINE, 'supabase/sql/consume_promo_code_versioning.sql'), 'utf-8');
    // Il ne doit surtout pas reecrire une fonction qu'on ne peut pas relire.
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function\s+(public\.)?consume_promo_code/i);
    expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
    // Mais il doit bien extraire et durcir.
    expect(sql).toMatch(/pg_get_functiondef/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated/);
  });
});
