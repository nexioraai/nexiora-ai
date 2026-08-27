import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { mockupsToProducts } from '../shared';
import { findSellablePodBrandMockup, sellablePodBrandMockups, isOwnPodDesignUrl } from '@/lib/mode3/podBrandMockups';

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

  // ============================================================
  // LOT 3 / L3-01 -- CE TEST A CHANGE DE CAMP, SCIEMMENT.
  //
  // Au LOT 2 il verrouillait `catalog-<uuid>::<variantId>` en croyant y voir
  // la forme attendue par le checkout et le fulfillment. Le LOT 3 a mesure au
  // point d'arrivee que c'est FAUX pour les fournisseurs POD :
  // `printful-adapter.createOrder` envoie `Number(order.supplier_product_id)`
  // et n'utilise jamais `order.variant_id` ; `gelato-adapter` envoie
  // `productUid: order.supplier_product_id`. Seul CJ consomme `variant_id`.
  // Chaque ligne `catalog_products` EST deja une variante Printful.
  //
  // Le suffixe etait donc redondant -- et nuisible : `MerchantProductModal`,
  // partage avec reseller/pod_custom, en ajoute un SECOND, et les cinq
  // decodeurs prennent l'index 1, c'est-a-dire la variante de la maquette et
  // non celle du visiteur.
  // ============================================================
  it('INVARIANT I — l\'id est `catalog-<uuid>`, SANS suffixe de variante', () => {
    const [produit] = mockupsToProducts(site());
    expect(produit.id).toBe('catalog-cp-uuid-1');
    expect(String(produit.id)).not.toContain('::');
  });

  it('L3-01 — la modale partagee ne peut plus produire un id a DEUX variantes', () => {
    // `MerchantProductModal` construit `p.id + (selectedVariant ? '::' + v : '')`.
    // Avec un id sans suffixe, le resultat reste bien forme, exactement comme
    // pour reseller/pod_custom.
    const [produit] = mockupsToProducts(site());
    const idPanier = `${produit.id}::7792`;
    const [uuid, variante, extra] = idPanier.replace(/^catalog-/, '').split('::');
    expect(uuid).toBe('cp-uuid-1');
    expect(variante).toBe('7792');
    expect(extra).toBeUndefined();
  });

  it('L3-01 — aucune variante n\'est proposee a l\'achat : une maquette = une variante', () => {
    // `selected_products[].variants` est une liste de CATALOGUE (choix de
    // generation cote editeur). L'exposer au visiteur offrait un choix que la
    // chaine ne pouvait pas honorer : l'image, le prix et le
    // `supplier_product_id` sont ceux de la seule variante rendue.
    const [produit] = mockupsToProducts(site());
    expect(produit.variants).toBeUndefined();
  });

  it('L3-03 — deux designs portant une maquette du MEME produit ne creent pas deux cartes de meme id', () => {
    const s = site();
    s.pod_designs = [
      s.pod_designs[0],
      { url: 'https://storage.test/designs/b.png', selected_products: {}, mockups: [
        { ...s.pod_designs[0].mockups[0], design_url: 'https://storage.test/designs/b.png' },
      ] },
    ];
    const produits = mockupsToProducts(s);
    expect(produits).toHaveLength(1);
    expect(new Set(produits.map((p) => p.id)).size).toBe(produits.length);
  });

  it('L3-03 — une maquette portee par un design d\'index >= 1 est bien vendable', () => {
    const s = site();
    const design0 = { url: 'https://storage.test/designs/vide.png', selected_products: {}, mockups: [] };
    s.pod_designs = [design0, s.pod_designs[0]];
    const produits = mockupsToProducts(s);
    expect(produits).toHaveLength(1);
    expect(produits[0].id).toBe('catalog-cp-uuid-1');
  });

  it('DEBT-058 — une maquette declare n\'avoir PAS de fiche produit', () => {
    const [produit] = mockupsToProducts(site());
    expect((produit as { hasProductPage?: boolean }).hasProductPage).toBe(false);
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

// ============================================================
// LOT 3 / DEBT-058 -- LE LIEN DE LA CARTE, MESURE AU RENDU.
//
// Le clic est intercepte (`preventDefault`, la modale s'ouvre), mais le
// `href` restait reel : nouvel onglet, URL collee, robots d'indexation.
// Pour une maquette POD BRAND il pointait vers une fiche que `fetchProduct`
// refuse -- un 404 annonce aux moteurs.
//
// ON MESURE LE MARKUP, pas la presence d'une prop : c'est l'attribut rendu
// qui atteint le crawler. `ClickableProductCard` rend son `<a>` des le
// premier passage (l'etat `open` vaut false, la modale n'est pas montee),
// donc `renderToStaticMarkup` suffit -- pas besoin de jsdom.
// ============================================================
import ClickableProductCard from '../ClickableProductCard';

describe('LOT 3 / DEBT-058 — la carte n\'annonce plus une fiche qui repond 404', () => {
  const rendre = (product: Record<string, unknown>) =>
    renderToStaticMarkup(
      <ClickableProductCard slug="ma-marque" product={product as never} primary="#111" lang="fr">
        <span>carte</span>
      </ClickableProductCard>
    );

  it('une maquette POD BRAND ne porte AUCUN href', () => {
    const [produit] = mockupsToProducts(site());
    const html = rendre(produit as never);
    expect(html).toContain('carte');
    expect(html).not.toContain('href=');
    expect(html).not.toContain('/produits/');
  });

  it('un produit ordinaire garde son href — aucune regression sur les autres surfaces', () => {
    const html = rendre({ id: 'catalog-abc', name: 'Bracelet', description: '', price: '10' });
    expect(html).toContain('href="/sites/ma-marque/produits/catalog-abc"');
  });

  it('`hasProductPage` absent vaut « oui » : le comportement par defaut est inchange', () => {
    const html = rendre({ id: 'p-1', name: 'Mug', description: '', price: '5' });
    expect(html).toContain('/produits/p-1');
  });

  it('`hasProductPage: true` porte bien un href', () => {
    const html = rendre({ id: 'p-2', name: 'X', description: '', price: '5', hasProductPage: true });
    expect(html).toContain('/produits/p-2');
  });
});

// ============================================================
// LOT 3 / ANOMALIE A -- LE SCENARIO FALSIFICATEUR, REJOUE A L'IDENTIQUE.
//
// La contre-verification avait execute le module reel et prouve que la
// vitrine et le checkout designaient des maquettes DIFFERENTES :
//
//   designs[0] : maquette de `cp-X`, `design_url` = ANCIENNE url (perimee)
//   designs[1] : maquette de `cp-X`, `design_url` = url du design (fraiche)
//
//   vitrine  -> ecartait la perimee, affichait celle de designs[1]
//   checkout -> `flatMap(...).find(...)` retenait la PERIMEE
//
// Le visiteur voyait le design B, le fournisseur recevait le design A.
//
// CE BLOC NE TESTE PAS UNE MUTATION : il teste l'ALIGNEMENT. Il interroge
// les deux couches sur le meme etat et exige la meme reponse.
// ============================================================
const U_ANCIEN = 'https://sb.test/storage/v1/object/public/pod-designs/ma-marque/ANCIEN.png';
const U_A = 'https://sb.test/storage/v1/object/public/pod-designs/ma-marque/A.png';
const U_B = 'https://sb.test/storage/v1/object/public/pod-designs/ma-marque/B.png';

const maquette = (over: Record<string, unknown> = {}) => ({
  catalog_product_id: 'cp-X', product_id: 198, variant_id: 7791,
  product_name: 'T-Shirt', mockup_url: 'https://img.test/defaut.png',
  price: 10, currency: 'USD', ...over,
});

describe('LOT 3 / ANOMALIE A — la vitrine et le checkout designent la MEME maquette', () => {
  const SITE_FALSIFICATEUR = (): any => ({
    ...site(),
    pod_designs: [
      // designs[0] : son url a change, sa maquette reste etiquetee ANCIENNE.
      { url: U_A, mockups: [maquette({ design_url: U_ANCIEN, mockup_url: 'https://img.test/ancien.png' })] },
      // designs[1] : maquette FRAICHE du MEME produit catalogue.
      { url: U_B, mockups: [maquette({ design_url: U_B, mockup_url: 'https://img.test/b.png' })] },
    ],
  });

  it('SCENARIO FALSIFICATEUR — vitrine = B, checkout = B', () => {
    const s = SITE_FALSIFICATEUR();
    const produits = mockupsToProducts(s);
    // Ce que le VISITEUR voit.
    expect(produits).toHaveLength(1);
    expect(produits[0].image).toBe('https://img.test/b.png');
    // Ce que le CHECKOUT vendrait pour ce meme id de panier.
    const vendu = findSellablePodBrandMockup(s.pod_designs, 'cp-X');
    expect(vendu?.mockup.design_url).toBe(U_B);
    // Et surtout : JAMAIS l'ancien.
    expect(vendu?.mockup.design_url).not.toBe(U_ANCIEN);
  });

  it('ALIGNEMENT GENERAL — pour chaque produit affiche, le checkout retient la maquette de la carte', () => {
    // La garantie ne porte pas sur un cas : sur tous. On confronte le rendu
    // reel a la selection du checkout, produit par produit.
    const s = SITE_FALSIFICATEUR();
    const produits = mockupsToProducts(s);
    for (const p of produits) {
      const realId = String(p.id).replace(/^catalog-/, '');
      const vendu = findSellablePodBrandMockup(s.pod_designs, realId);
      expect(vendu, `aucune maquette vendable pour ${p.id}`).toBeTruthy();
      expect(vendu!.mockup.mockup_url).toBe(p.image);
    }
  });

  it('une maquette SANS catalog_product_id n\'est ni affichee ni vendable', () => {
    const s: any = { ...site(), pod_designs: [{ url: U_A, mockups: [
      { design_url: U_A, mockup_url: 'https://img.test/orphelin.png', price: 5, currency: 'USD', product_name: 'X' },
    ] }] };
    expect(mockupsToProducts(s)).toEqual([]);
    expect(sellablePodBrandMockups(s.pod_designs)).toEqual([]);
    expect(findSellablePodBrandMockup(s.pod_designs, 'undefined')).toBeUndefined();
  });

  it('VARIANTE 1 — designs[0] frais, designs[1] perime : c\'est designs[0] qui est retenu', () => {
    const s: any = { ...site(), pod_designs: [
      { url: U_A, mockups: [maquette({ design_url: U_A, mockup_url: 'https://img.test/a.png' })] },
      { url: U_B, mockups: [maquette({ design_url: U_ANCIEN, mockup_url: 'https://img.test/perime.png' })] },
    ] };
    expect(mockupsToProducts(s)[0].image).toBe('https://img.test/a.png');
    expect(findSellablePodBrandMockup(s.pod_designs, 'cp-X')?.mockup.design_url).toBe(U_A);
  });

  it('VARIANTE 2 — TOUTES les maquettes sont perimees : rien n\'est affiche, rien n\'est vendable', () => {
    const s: any = { ...site(), pod_designs: [
      { url: U_A, mockups: [maquette({ design_url: U_ANCIEN })] },
      { url: U_B, mockups: [maquette({ design_url: U_ANCIEN })] },
    ] };
    expect(mockupsToProducts(s)).toEqual([]);
    expect(findSellablePodBrandMockup(s.pod_designs, 'cp-X')).toBeUndefined();
  });

  it('VARIANTE 3 — deux designs FRAIS du meme produit : le premier gagne, des DEUX cotes', () => {
    const s: any = { ...site(), pod_designs: [
      { url: U_A, mockups: [maquette({ design_url: U_A, mockup_url: 'https://img.test/a.png' })] },
      { url: U_B, mockups: [maquette({ design_url: U_B, mockup_url: 'https://img.test/b.png' })] },
    ] };
    expect(mockupsToProducts(s)).toHaveLength(1);
    expect(mockupsToProducts(s)[0].image).toBe('https://img.test/a.png');
    expect(findSellablePodBrandMockup(s.pod_designs, 'cp-X')?.mockup.design_url).toBe(U_A);
  });

  it('la convention `designs[0]` n\'est PAS reintroduite : un design d\'index >= 1 reste vendable seul', () => {
    const s: any = { ...site(), pod_designs: [
      { url: U_A, mockups: [] },
      { url: U_B, mockups: [maquette({ design_url: U_B, mockup_url: 'https://img.test/b.png' })] },
    ] };
    expect(mockupsToProducts(s)).toHaveLength(1);
    expect(findSellablePodBrandMockup(s.pod_designs, 'cp-X')?.mockup.design_url).toBe(U_B);
  });
});

describe('LOT 3 / ANOMALIE B — la definition du prefixe locataire est UNIQUE', () => {
  it('accepte le bon slug, refuse un autre slug et une URL exterieure', () => {
    expect(isOwnPodDesignUrl(U_A, 'ma-marque')).toBe(true);
    expect(isOwnPodDesignUrl(U_A.replace('/ma-marque/', '/autre-boutique/'), 'ma-marque')).toBe(false);
    expect(isOwnPodDesignUrl('https://evil.example/x.png', 'ma-marque')).toBe(false);
  });

  it('fail-closed sur toute valeur non exploitable', () => {
    for (const v of [null, undefined, '', 0, {}, []]) {
      expect(isOwnPodDesignUrl(v, 'ma-marque')).toBe(false);
      expect(isOwnPodDesignUrl(U_A, v)).toBe(false);
    }
  });

  it('un slug qui est un PREFIXE d\'un autre ne passe pas pour lui', () => {
    // `ma-marque` ne doit pas valider une URL de `ma-marque-bis`.
    const urlBis = 'https://sb.test/storage/v1/object/public/pod-designs/ma-marque-bis/d.png';
    expect(isOwnPodDesignUrl(urlBis, 'ma-marque')).toBe(false);
    expect(isOwnPodDesignUrl(urlBis, 'ma-marque-bis')).toBe(true);
  });
});
