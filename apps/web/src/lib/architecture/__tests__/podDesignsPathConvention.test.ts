import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================
// DEBT-084 -- LA CONVENTION `pod-designs/<slug>/` EST DEVENUE UNE FRONTIERE.
//
// CE QUI A CHANGE. Avant le correctif, ce prefixe n'etait qu'une habitude :
// les policies Storage ne verifiaient que `bucket_id`, donc n'importe quel
// utilisateur authentifie pouvait ecrire et supprimer sous le prefixe d'un
// autre marchand. `pod_designs_ownership.sql` fait desormais du PREMIER
// SEGMENT DU CHEMIN la cle de propriete :
//
//     EXISTS (SELECT 1 FROM sites
//             WHERE sites.slug = split_part(objects.name, '/', 1)
//               AND sites.owner_id = auth.uid())
//
// POURQUOI CE TEST EXISTE. Trois endroits du code dependent maintenant de
// cette forme, et aucun ne le declare :
//   * `edit/[slug]/page.tsx`   ecrit `${slug}/...` depuis le NAVIGATEUR -- si
//     la forme change, la policy refuse le televersement, silencieusement ;
//   * `pod/generate-mockups`   ecrit `${slug}/...` sous service_role -- il
//     passerait meme si la forme changeait, creant une divergence entre les
//     deux points d'ecriture ;
//   * `isOwnPodDesignUrl`      LIT `/pod-designs/<slug>/` comme preuve
//     d'appartenance, et le checkout s'en sert avant une fabrication que la
//     plateforme avance.
//
// Une policy SQL ne peut pas se defendre contre une convention de chemin qui
// derive dans le code. Ce cliquet, si.
// ============================================================

const SRC = join(__dirname, '..', '..', '..');
const lire = (p: string) => readFileSync(join(SRC, p), 'utf-8');

describe('DEBT-084 — le préfixe `pod-designs/<slug>/` est la clé de propriété', () => {
  it('l’éditeur téléverse sous `${slug}/` — c’est ce que la policy contrôle', () => {
    const src = lire(join('app', 'edit', '[slug]', 'page.tsx'));
    const bloc = src.slice(src.indexOf("storage.from('pod-designs')") - 400,
                           src.indexOf("storage.from('pod-designs')"));
    expect(bloc, 'chemin construit dans le navigateur').toMatch(/const path = `\$\{slug\}\//);
  });

  it('la génération de maquettes téléverse sous le même préfixe', () => {
    const src = lire(join('app', 'api', 'pod', 'generate-mockups', 'route.ts'));
    expect(src).toMatch(/const storagePath = `\$\{slug\}\//);
  });

  it('`isOwnPodDesignUrl` lit exactement ce préfixe — une seule définition', () => {
    const src = lire(join('lib', 'mode3', 'podBrandMockups.ts'));
    expect(src).toContain('`/pod-designs/${slug}/`');
    // Une SEULE définition du format dans tout `src/` : si une seconde
    // apparaît, les deux divergeront, et le checkout jugera sur la mauvaise.
    const fichiers = [
      join('lib', 'mode3', 'podBrandMockups.ts'),
      join('app', 'api', 'shop', 'checkout', 'route.ts'),
      join('app', 'api', 'pod', 'generate-mockups', 'route.ts'),
    ];
    const definisseurs = fichiers.filter((f) =>
      /export function isOwnPodDesignUrl/.test(lire(f))
    );
    expect(definisseurs).toEqual([join('lib', 'mode3', 'podBrandMockups.ts')]);
  });

  it('le correctif SQL est versionné, et il RESSERRE — il n’ajoute rien', () => {
    const sql = readFileSync(join(SRC, '..', 'supabase', 'sql', 'pod_designs_ownership.sql'), 'utf-8');
    const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code).toMatch(/ALTER POLICY/);
    expect(code).not.toMatch(/\b(CREATE|DROP)\s+POLICY\b/i);
    expect(code).not.toMatch(/\b(GRANT|REVOKE)\b/i);
    expect(code).not.toMatch(/\b(INSERT INTO|UPDATE public|DELETE FROM)\b/i);
  });

  it('il vérifie la propriété par `owner_id`, jamais par `owner_email`', () => {
    const sql = readFileSync(join(SRC, '..', 'supabase', 'sql', 'pod_designs_ownership.sql'), 'utf-8');
    const cond = sql.slice(sql.indexOf('cond text :='), sql.indexOf('BEGIN', sql.indexOf('cond text :=')));
    expect(cond).toContain('owner_id = auth.uid()');
    expect(cond).not.toContain('owner_email');
    expect(cond).toContain("split_part(objects.name, ''/''::text, 1)");
  });

  it('il ne touche PAS les policies `site-images` — DEBT-072 reste distincte', () => {
    const sql = readFileSync(join(SRC, '..', 'supabase', 'sql', 'pod_designs_ownership.sql'), 'utf-8');
    const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    const bloc = code.slice(0, code.indexOf('END $$;'));
    expect(bloc).not.toContain('site-images');
    expect(bloc).toContain("LIKE '%pod-designs%'");
  });
});
