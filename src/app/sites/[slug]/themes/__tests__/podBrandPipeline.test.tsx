import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { mockupsToProducts } from '../shared';

// ============================================================
// LOT 2 / INVARIANT B -- LE PIPELINE LEGITIME DE `pod_brand`.
//
// POURQUOI CE FICHIER EXISTE. Le LOT 2 a commence par une hypothese FAUSSE :
// « pod_brand n'a pas de catalogue, retirons-lui ses fournisseurs ». Le depot
// l'a refutee -- ses produits SONT des produits catalogue Printful, portes
// par ses mockups. Rien ne protegeait cette chaine : retirer la garde de
// sous-type de `mockupsToProducts` ne cassait aucun des 3088 tests
// (mutation B2), alors meme que `pod_designs` est une colonne ECRIVABLE par
// le marchand via PostgREST (elle figure dans le GRANT UPDATE des 41
// colonnes de `lot_g_final_field_level_authorization.sql`).
//
// CE QUE LE LOT 2 VERROUILLE ICI : que fermer le mecanisme
// `site_catalog_selections` a `pod_brand` ne casse PAS sa chaine de vente.
// Ce fichier ne juge pas le contenu du pipeline -- c'est le LOT 3.
// ============================================================

const DESIGN_URL = 'https://storage.test/designs/logo.png';

function site(over: Record<string, unknown> = {}): any {
  return {
    id: 'site-1',
    slug: 'ma-marque',
    mode: 3,
    dropship_type: 'pod_brand',
    cj_margin_percent: 50,
    cj_round_mode: null,
    pod_designs: [
      {
        url: DESIGN_URL,
        selected_products: { '71': { variants: [{ variant_id: 'v-1', label: 'M / Noir', price: 12 }] } },
        mockups: [
          {
            product_id: '71',
            variant_id: 'vid-42',
            catalog_product_id: 'cp-uuid-1',
            product_name: 'T-Shirt — M / Noir',
            mockup_url: 'https://img.test/mockup.png',
            price: 10,
            currency: 'usd',
            design_url: DESIGN_URL,
            shipping_days_min: 3,
            shipping_days_max: 7,
          },
        ],
      },
    ],
    ...over,
  };
}

describe('LOT 2 / INVARIANT B — pod_brand produit bien ses articles vendables', () => {
  it('un pod_brand avec un design et un mockup obtient un produit', () => {
    const p = mockupsToProducts(site());
    expect(p).toHaveLength(1);
    expect(p[0].image).toBe('https://img.test/mockup.png');
  });

  it('INVARIANT I — l\'id porte la forme `catalog-<uuid>::<variantId>`, celle que decodent checkout et pod-fulfill', () => {
    const [produit] = mockupsToProducts(site());
    expect(produit.id).toBe('catalog-cp-uuid-1::vid-42');
    // Meme decodage que `parseCatalogId` (checkout), `stripVariant`
    // (pod-fulfill) et `resolveShipping` : la partie avant `::` est l'uuid.
    expect(String(produit.id).replace(/^catalog-/, '').split('::')[0]).toBe('cp-uuid-1');
  });

  it('le prix suit la marge du marchand, jamais le cout fournisseur brut', () => {
    const [produit] = mockupsToProducts(site());
    expect(produit.priceNumber).toBe(15); // 10 x (1 + 50/100)
  });

  it('un mockup issu d\'un design PERIME est ecarte', () => {
    const s = site();
    s.pod_designs[0].mockups[0].design_url = 'https://storage.test/designs/ANCIEN.png';
    expect(mockupsToProducts(s)).toEqual([]);
  });
});

describe('LOT 2 — la garde de sous-type de `mockupsToProducts` (mutation B2)', () => {
  // `pod_designs` est ECRIVABLE par le marchand. Sans cette garde, un
  // `reseller` pourrait injecter dans sa propre vitrine des produits forges.
  it.each(['reseller', 'pod_custom', null, undefined, '', 'legacy_x'])(
    'sous-type %s + `pod_designs` rempli -> AUCUN produit',
    (t) => {
      expect(mockupsToProducts(site({ dropship_type: t }))).toEqual([]);
    }
  );

  it('un site Mode 1 ou Mode 2 portant des `pod_designs` n\'obtient rien non plus', () => {
    for (const mode of [1, 2]) {
      expect(mockupsToProducts(site({ mode, dropship_type: null }))).toEqual([]);
    }
  });

  it('INVARIANT C — le cloisonnement fournisseur reste la seconde barriere', async () => {
    // Un `catalog_product_id` CJ force dans `pod_designs` produirait bien un
    // article ici -- c'est `suppliersForDropshipType` qui le refuse au
    // checkout. Les deux gardes sont independantes, et c'est voulu.
    const { suppliersForDropshipType } = await import('@/lib/dropship/suppliers');
    expect(suppliersForDropshipType('pod_brand')).toEqual(['printful', 'gelato']);
    expect(suppliersForDropshipType('pod_brand')).not.toContain('cj');
  });
});

describe('LOT 2 — PERIMETRE : la regle de chargement des selections n\'est PAS touchee', () => {
  const RACINE = join(__dirname, '../../../../../..');
  const source = readFileSync(join(RACINE, 'src/app/sites/[slug]/themes/shared.tsx'), 'utf-8');

  it('`loadCatalogSelections` garde son allowlist positive, inchangee', () => {
    expect(source).toContain(
      "data.mode === 3 && (data.dropship_type === 'reseller' || data.dropship_type === 'pod_custom')"
    );
  });

  it('les deux chaines Mode 3 restent DISJOINTES : selections d\'un cote, pod_designs de l\'autre', () => {
    // C'est la distinction que le LOT 2 a etablie. Les confondre etait la
    // cause racine de toute la divergence.
    const selections = source.slice(source.indexOf('async function loadCatalogSelections'));
    expect(selections.slice(0, 1200)).not.toContain('pod_designs');
    const mockups = source.slice(source.indexOf('export function mockupsToProducts'));
    expect(mockups.slice(0, 1500)).not.toContain('site_catalog_selections');
  });
});
