import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { hasSupplierCatalog, usesCatalogSelections } from '../catalogAdmission';

// ============================================================
// LOT 2 -- L'ADMISSION AU MECANISME DE SELECTION.
//
// Ce fichier verrouille la distinction que le LOT 2 a du etablir en
// falsifiant sa propre premiere hypothese : « produit catalogue » n'est PAS
// « selection catalogue ». `pod_brand` vend bien des produits catalogue
// Printful -- via ses mockups -- mais n'utilise jamais
// `site_catalog_selections`.
// ============================================================

const MODES = [1, 2, 3, 0, 4, null, undefined, '3', NaN] as const;
const VALEURS = [
  null, undefined, '', 'RESELLER', 'pod-brand', 'legacy_mode_x', 0, 3, {}, [],
] as const;

describe('LOT 2 -- usesCatalogSelections : les seuls couples admis', () => {
  it.each(['reseller', 'pod_custom'])('mode 3 + %s -> admis', (t) => {
    expect(usesCatalogSelections(3, t)).toBe(true);
  });

  it('mode 3 + pod_brand -> REFUSE : ses produits viennent de pod_designs', () => {
    expect(usesCatalogSelections(3, 'pod_brand')).toBe(false);
  });

  it.each(VALEURS)('mode 3 + %s -> refuse : allowlist positive, jamais une negation', (v) => {
    expect(usesCatalogSelections(3, v)).toBe(false);
  });

  it.each([1, 2, 0, 4, null, undefined, '3'])(
    'mode %s + un sous-type pourtant valide -> refuse : le sous-type ne decide jamais seul',
    (m) => {
      for (const t of ['reseller', 'pod_custom', 'pod_brand']) {
        expect(usesCatalogSelections(m, t)).toBe(false);
      }
    }
  );

  it('la matrice complete ne contient que DEUX couples vrais', () => {
    const vrais: string[] = [];
    for (const m of MODES) {
      for (const t of [...VALEURS, 'reseller', 'pod_brand', 'pod_custom']) {
        if (usesCatalogSelections(m, t)) vrais.push(`${String(m)}/${String(t)}`);
      }
    }
    expect(vrais.sort()).toEqual(['3/pod_custom', '3/reseller']);
  });
});

describe('LOT 2 -- la regle est IMBRIQUEE dans hasSupplierCatalog, jamais parallele', () => {
  it('admis au mecanisme => admis au catalogue (implication stricte, jamais l\'inverse)', () => {
    for (const m of MODES) {
      for (const t of ['reseller', 'pod_brand', 'pod_custom', null, 'x']) {
        if (usesCatalogSelections(m, t)) expect(hasSupplierCatalog(m)).toBe(true);
      }
    }
    // L'inverse est FAUX, et c'est le point : `pod_brand` a un catalogue
    // fournisseur sans avoir le mecanisme de selection.
    expect(hasSupplierCatalog(3)).toBe(true);
    expect(usesCatalogSelections(3, 'pod_brand')).toBe(false);
  });
});

describe('LOT 2 -- INVARIANT C : le cloisonnement fournisseur reste hors de cette regle', () => {
  it('cette autorite ne parle jamais de fournisseur', async () => {
    // `suppliersForDropshipType` reste INCHANGE : `pod_brand` doit conserver
    // Printful/Gelato, sans quoi ses ventes legitimes seraient refusees.
    const { suppliersForDropshipType } = await import('../suppliers');
    expect(suppliersForDropshipType('pod_brand')).toEqual(['printful', 'gelato']);
    expect(usesCatalogSelections(3, 'pod_brand')).toBe(false);
  });
});

// ============================================================
// LOT 2 -- LES SURFACES CLIENT NE PEUVENT PAS IMPORTER CETTE AUTORITE.
//
// `catalogAdmission.ts` porte `import 'server-only'` : un composant client ne
// peut pas le lire. L'editeur marchand doit donc ECRIRE sa condition, et
// c'est exactement la ou une divergence peut renaitre sans que rien ne la
// voie -- mesure : retirer `pod_custom` de cette ligne ne cassait aucun des
// 3175 tests (mutation C19, survivante).
//
// Ce bloc verrouille la CONDITION DE RENDU REELLE, lue dans le fichier
// source. Ce n'est pas un test de presence : c'est le seul point d'observation
// disponible pour une expression JSX d'un composant client non monte par la
// suite. Meme patron que les trois montages de `CatalogSearch`.
// ============================================================
describe('LOT 2 / L2-E -- le miroir client de l\'editeur reste aligne sur l\'autorite', () => {
  const RACINE = join(__dirname, '../../../..');
  const editeur = readFileSync(join(RACINE, 'src/app/edit/[slug]/page.tsx'), 'utf-8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

  it('l\'interface de selection est offerte aux DEUX sous-types qui utilisent le mecanisme', () => {
    const [, condition] =
      editeur.match(/\{site\?\.mode === 3 && \(([^)]*)\) && <CatalogSelections/) ?? [];
    expect(condition, 'condition de rendu de <CatalogSelections> introuvable').toBeTruthy();
    for (const t of ['reseller', 'pod_custom']) {
      expect(condition, t).toContain(`'${t}'`);
      expect(usesCatalogSelections(3, t)).toBe(true);
    }
  });

  it('`pod_brand` en reste exclu, comme le dit l\'autorite', () => {
    const [, condition] =
      editeur.match(/\{site\?\.mode === 3 && \(([^)]*)\) && <CatalogSelections/) ?? [];
    expect(condition).not.toContain("'pod_brand'");
    expect(usesCatalogSelections(3, 'pod_brand')).toBe(false);
  });

  it('la garde de mode y est presente : le sous-type ne decide jamais seul', () => {
    expect(editeur).toContain('site?.mode === 3 && (');
  });
});

// ============================================================
// LOT 3 / DEBT-055 -- L'AUTO-CURATION DE LA CREATION DE SITE.
//
// `api/chat/route.ts` declenchait la curation sur sa propre condition
// (`finalMode === 3 && persistedDropshipType`), plus large que la realite :
// `pod_brand` y passait, alors que ses produits viennent de `pod_designs` et
// que `CATALOG_SUBTYPES` lui refuse les outils. Elle interroge desormais
// l'autorite du LOT 2.
//
// LIMITE ASSUMEE DE CETTE PREUVE : appeler `POST /api/chat` exigerait de
// monter tout le pipeline de generation (Anthropic, Pexels, Supabase, score
// IA). Ce bloc verifie donc que la route CONSOMME l'autorite et n'a plus de
// condition propre ; la matrice de comportement des quatre cas est prouvee
// par les tests d'unite ci-dessus, sur l'autorite elle-meme. La chaine des
// deux est ce qui garantit le comportement -- aucune des deux ne suffit.
// ============================================================
describe('LOT 3 / DEBT-055 -- la creation de site delegue, elle ne decide plus', () => {
  const RACINE2 = join(__dirname, '../../../..');
  const route = readFileSync(join(RACINE2, 'src/app/api/chat/route.ts'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

  it('l\'auto-curation est gardee par `usesCatalogSelections`', () => {
    expect(route).toContain('usesCatalogSelections(finalMode, persistedDropshipType)');
  });

  it('la condition maison a disparu', () => {
    expect(route).not.toMatch(/finalMode === 3 && persistedDropshipType/);
  });

  it('les quatre cas attendus decoulent de l\'autorite', () => {
    expect(usesCatalogSelections(3, 'reseller')).toBe(true);
    expect(usesCatalogSelections(3, 'pod_custom')).toBe(true);
    expect(usesCatalogSelections(3, 'pod_brand')).toBe(false);
    expect(usesCatalogSelections(1, null)).toBe(false);
    expect(usesCatalogSelections(2, null)).toBe(false);
  });
});
