// ============================================================
// DETTE 6c — LA FICHE PRODUIT : VISIBLE, MAIS PAS ACHETABLE.
//
// Premiere couverture de rendu de ce composant. Meme methodologie que
// shop-product-guard / forSaleStorefront : renderToStaticMarkup, jamais une
// lecture du code source.
//
// TROIS ETATS QU'IL NE FAUT PAS CONFONDRE :
//   `published` -> la page n'existe pas (filtre de fetchProduct, hors de ce test) ;
//   `inStock`   -> « Rupture de stock », bouton rendu mais desactive ;
//   `forSale`   -> bouton PAS RENDU DU TOUT, et un libelle explicite.
// Un bouton grise invite a reessayer ; ici il n'y a rien a reessayer, le
// checkout refuserait (409).
// ============================================================
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import ProductPageView from '../ProductPageView';
import { CartProvider } from '../../../themes/CartContext';
import type { ProductPage } from '../fetchProduct';

function page(over: Partial<ProductPage> = {}): ProductPage {
  return {
    id: 'p-1', name: 'Bougie de soja', description: 'Cire naturelle',
    priceNumber: 24.5, currency: 'CAD', images: [], inStock: true, forSale: true,
    siteName: 'Ma Boutique', siteSlug: 'ma-boutique', siteCustomDomain: null,
    primary: '#111', theme: 'editorial', lang: 'fr', mode: 2, shippingFlat: 0,
    // LOT 4 -- champs AJOUTES au contrat de `ProductPage`. Neutres ici : un
    // produit du marchand n'a pas de variante fournisseur, donc le rendu de
    // ces cas est rigoureusement celui d'avant.
    supplierId: null, supplierProductId: null, requiresVariant: false,
    // LOT 5 -- champ AJOUTE : seul `pod_custom` exige un design du visiteur.
    requiresDesign: false,
    ...over,
  };
}

const render = (p: ProductPage) =>
  renderToStaticMarkup(
    <CartProvider>
      <ProductPageView product={p} />
    </CartProvider>
  );

describe('DETTE 6c — fiche produit retirée de la vente', () => {
  it('le contenu reste ENTIÈREMENT consultable : nom, prix, description', () => {
    const html = render(page({ forSale: false }));
    expect(html).toContain('Bougie de soja');
    expect(html).toContain('24.50');
    expect(html).toContain('Cire naturelle');
  });

  it('AUCUN bouton « Ajouter au panier »', () => {
    expect(render(page({ forSale: false }))).not.toContain('Ajouter au panier');
  });

  it('un libellé explique pourquoi, plutôt qu’un bouton grisé muet', () => {
    expect(render(page({ forSale: false }))).toContain('n’est pas en vente');
  });

  it('produit vendable : le bouton est là — non-régression', () => {
    expect(render(page({ forSale: true }))).toContain('Ajouter au panier');
  });
});

describe('DETTE 6c — `forSale` et `inStock` ne se confondent pas', () => {
  it('épuisé mais EN VENTE : le bouton est rendu (désactivé), et « Rupture de stock » s’affiche', () => {
    const html = render(page({ forSale: true, inStock: false }));
    expect(html).toContain('Rupture de stock');
    expect(html).toContain('Ajouter au panier');
  });

  it('EN STOCK mais retiré de la vente : aucun bouton, et aucune mention de rupture', () => {
    const html = render(page({ forSale: false, inStock: true }));
    expect(html).not.toContain('Ajouter au panier');
    expect(html).not.toContain('Rupture de stock');
  });

  it('les 4 combinaisons : seul `forSale` décide de la PRÉSENCE du bouton', () => {
    for (const forSale of [true, false]) {
      for (const inStock of [true, false]) {
        const html = render(page({ forSale, inStock }));
        expect(html.includes('Ajouter au panier'), `forSale=${forSale} inStock=${inStock}`).toBe(forSale);
      }
    }
  });
});

describe('DETTE 6c — le libellé suit la langue du site', () => {
  for (const [lang, extrait] of [['en', 'not for sale'], ['es', 'no está a la venta']] as const) {
    it(`${lang}`, () => {
      expect(render(page({ forSale: false, lang }))).toContain(extrait);
    });
  }

  it('langue inconnue -> repli anglais, jamais une page vide', () => {
    expect(render(page({ forSale: false, lang: 'zz' }))).toContain('not for sale');
  });
});

// ============================================================
// LOT 4 / R4-01 -- LA FICHE PRODUIT ET LA MODALE DOIVENT AVOIR LE MEME
// CONTRAT D'ACHAT.
//
// La fiche emettait `catalog-<uuid>` SANS variante, alors que la modale de la
// vitrine rend son bouton inactif tant qu'aucune variante n'est choisie pour
// le MEME produit. Mesure en production : 19 fiches publiees et indexees, et
// deux commandes parties sans variante -- le fulfillment a retenu
// `variants[0]`, une variante arbitraire.
//
// LIMITE DU HARNAIS, ASSUMEE : ce depot n'a ni jsdom ni testing-library ; les
// effets React ne s'executent pas sous `renderToStaticMarkup`. On ne peut
// donc pas simuler le CLIC sur une variante. Ce qui EST observable -- et qui
// est precisement l'etat dangereux -- c'est le premier rendu : le bouton doit
// deja etre inactif. La seconde moitie de la garantie est posee cote serveur
// (`checkCatalogStock`), ou elle est incontournable.
// ============================================================
describe('LOT 4 / R4-01 — la fiche produit n\'offre pas d\'achat sans variante', () => {
  it('produit catalogue exigeant une variante -> bouton rendu INACTIF des le premier rendu', () => {
    const html = render(page({ mode: 3, requiresVariant: true, supplierId: 'cj', supplierProductId: 'cj-pid-1' }));
    expect(html).toContain('disabled');
  });

  it('produit du marchand (aucune variante fournisseur) -> comportement INCHANGE, bouton actif', () => {
    const html = render(page({ mode: 2, requiresVariant: false }));
    expect(html).toContain('Ajouter au panier');
    expect(html).not.toContain('disabled=""');
  });

  it('produit catalogue DEJA une variante (Printful/Gelato) -> aucun blocage', () => {
    const html = render(page({ mode: 3, requiresVariant: false, supplierId: 'printful', supplierProductId: 'sp-1' }));
    expect(html).not.toContain('disabled=""');
  });
});

describe('LOT 4 / R4-01 — l\'identifiant de panier porte la variante choisie', () => {
  // LIMITE DU HARNAIS, NOMMEE : le suffixe n'apparait qu'APRES un clic sur une
  // variante, et ce depot n'a ni jsdom ni testing-library -- aucun test ne
  // peut declencher ce clic. Ce cliquet observe donc l'EXPRESSION REELLE du
  // fichier, comme le depot le fait deja pour les conditions JSX qu'il ne
  // peut pas rendre. Ce n'est pas la preuve complete : la garantie qui compte
  // est posee cote SERVEUR (`checkCatalogStock`), ou elle est incontournable
  // et ou elle EST testee comportementalement.
  const source = readFileSync(join(__dirname, '../ProductPageView.tsx'), 'utf-8');

  it('la variante choisie est concatenee a l\'identifiant, jamais ignoree', () => {
    expect(source).toContain("id={product.id + (varianteChoisie ? '::' + varianteChoisie : '')}");
  });

  it('la meme forme que les deux modales : un seul `::`, jamais deux', () => {
    // `product.id` d'une fiche catalogue vaut `catalog-<uuid>` (sans suffixe,
    // cf. `fetchProduct`), donc la concatenation produit exactement un `::`.
    // C'est la faute inverse -- deux suffixes -- qui avait produit L3-01.
    expect(source).not.toMatch(/varianteChoisie[^\n]*::[^\n]*::/);
  });
});

// ============================================================
// LOT 5 / P5-02 + P5-03 -- LA FICHE PRODUIT `pod_custom`, AU RENDU REEL.
//
// Elle n'avait aucun televerseur : tout achat depuis la fiche partait sans
// design. Ici on mesure le MARKUP, pas une prop -- et c'est possible parce
// que, sans variante exigee, l'etat initial n'est pas « en chargement » :
// l'exigence de design decide seule.
// ============================================================
describe('LOT 5 — un support pod_custom n\'est pas achetable nu depuis la fiche', () => {
  const POD_CUSTOM = { mode: 3, requiresDesign: true, requiresVariant: false, supplierId: 'printful', supplierProductId: 'sp-1' };

  it('design exige et aucun televerse -> bouton INACTIF', () => {
    expect(render(page(POD_CUSTOM))).toContain('disabled');
  });

  it('le televerseur de design EST rendu sur la fiche', () => {
    const html = render(page(POD_CUSTOM));
    expect(html.toLowerCase()).toMatch(/design|upload|televers/);
  });

  it('NON-REGRESSION — un site sans exigence de design garde son bouton actif', () => {
    const html = render(page({ mode: 3, requiresDesign: false, requiresVariant: false, supplierId: 'printful', supplierProductId: 'sp-1' }));
    expect(html).not.toContain('disabled=""');
  });

  it('NON-REGRESSION — un produit du marchand est inchange', () => {
    const html = render(page({ mode: 2, requiresDesign: false, requiresVariant: false }));
    expect(html).toContain('Ajouter au panier');
    expect(html).not.toContain('disabled=""');
  });
});
