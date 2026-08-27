// ============================================================
// DETTE 6c — UN PRODUIT RETIRE DE LA VENTE RESTE VISIBLE, MAIS N'EST PLUS
// ACHETABLE. RENDU REEL, jamais une lecture du code source.
//
// LE DEFAUT MESURE. `for_sale = false` n'etait honore que par le checkout
// (409) et, depuis la dette 6b, par l'estimation de livraison (403). La
// vitrine ne lisait meme pas la colonne : le visiteur voyait le prix, cliquait
// « Ajouter au panier », remplissait son panier et ses coordonnees, et
// n'apprenait le refus qu'au paiement. Le marchand avait bien retire son
// produit ; personne ne le disait a l'acheteur avant l'echec.
//
// CE QUE CES TESTS EXIGENT, ET CE QU'ILS INTERDISENT :
//   * le produit reste RENDU -- nom, prix, description. Retirer de la vente
//     n'est pas depublier, sinon `published` aurait suffi ;
//   * aucun chemin d'ajout au panier ne subsiste ;
//   * `forSale` ABSENT (catalogue jsonb du Mode 1, maquettes POD) ne change
//     RIEN : la notion n'y existe pas, et le Mode 1 ne doit pas regresser.
//
// Meme methodologie que shop-product-guard.test.tsx : renderToStaticMarkup.
// ============================================================
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { CartProvider } from '../CartContext';
import NoirShopSection from '../NoirShopSection';
import VifShopSection from '../VifShopSection';
import EditorialShopSection from '../EditorialShopSection';
import StorefrontDense from '../StorefrontDense';
import FamilyFilter from '../FamilyFilter';
import { canAddToCart, normalizeProduct, type Site, type Product } from '../shared';

function makeSite(products: unknown[]): Site {
  return {
    id: 'site-1', slug: 'ma-boutique', name: 'Ma Boutique', mode: 2, lang: 'fr',
    hidden_sections: [], hero_title: 'Bienvenue', about: 'Une description.',
    contact: {}, social_links: {}, testimonials: [], sections: [],
    products, gallery: [],
  } as unknown as Site;
}

const LABELS = {
  shopKicker: 'Boutique', shopTitle: 'Nos produits', all: 'Tout',
  onQuote: 'Sur devis', request: 'Demander', addToCart: 'Ajouter au panier',
  estimatedDelivery: 'Livraison estimée', days: 'jours',
  securePayment: '', freeDelivery: '', easyReturns: '', support: '',
  newArrivals: '', browse: '',
};

/** La forme exacte que `mapShopProducts` produit pour une ligne `shop_products`. */
function produit(over: Partial<Product> = {}): Product {
  return {
    id: 'p1', name: 'Bougie de soja', description: 'Cire naturelle',
    price: '24.50 CAD', priceNumber: 24.5, currency: 'CAD',
    image: undefined, cjVid: null, forSale: true,
    ...over,
  } as Product;
}

// `EditorialShopSection` exige une prop `primary` que Noir et Vif n'ont pas :
// chaque section est donc enveloppee dans son propre rendu, plutot que
// forcee dans une signature commune par un cast.
const SECTIONS: Array<[string, (products: Product[]) => string]> = [
  ['Noir', (p) => renderToStaticMarkup(
    <CartProvider><NoirShopSection site={makeSite(p)} /></CartProvider>)],
  ['Vif', (p) => renderToStaticMarkup(
    <CartProvider><VifShopSection site={makeSite(p)} /></CartProvider>)],
  ['Editorial', (p) => renderToStaticMarkup(
    <CartProvider><EditorialShopSection site={makeSite(p)} primary="#111" /></CartProvider>)],
];

function renderDense(products: Product[]) {
  return renderToStaticMarkup(
    <CartProvider>
      <StorefrontDense
        products={products} primary="#111" siteId="site-1" slug="ma-boutique"
        siteName="Ma Boutique" lang="fr" labels={LABELS}
      />
    </CartProvider>
  );
}

function renderFamily(products: Product[]) {
  return renderToStaticMarkup(
    <CartProvider>
      <FamilyFilter
        products={products} primary="#111" siteId="site-1" slug="ma-boutique"
        lang="fr" labels={LABELS}
      />
    </CartProvider>
  );
}

const TOUS: Array<[string, (p: Product[]) => string]> = [
  ...SECTIONS,
  ['StorefrontDense', renderDense],
  ['FamilyFilter', renderFamily],
];

describe('DETTE 6c — `forSale: false` : visible, mais aucun chemin d’achat', () => {
  for (const [nom, rendu] of TOUS) {
    it(`${nom} : le produit est TOUJOURS affiché (nom et prix)`, () => {
      const html = rendu([produit({ forSale: false })]);
      expect(html).toContain('Bougie de soja');
      expect(html).toContain('24.50');
    });

    it(`${nom} : AUCUN bouton « Ajouter au panier »`, () => {
      const html = rendu([produit({ forSale: false })]);
      expect(html).not.toContain('Ajouter au panier');
    });

    it(`${nom} : un produit vendable garde son bouton — non-régression`, () => {
      const html = rendu([produit({ forSale: true })]);
      expect(html).toContain('Ajouter au panier');
    });

    it(`${nom} : \`forSale\` ABSENT ne retire RIEN (Mode 1 / maquettes POD inchangés)`, () => {
      const sans = produit();
      delete (sans as Record<string, unknown>).forSale;
      expect(rendu([sans])).toContain('Ajouter au panier');
    });
  }
});

describe('DETTE 6c — `canAddToCart`, le point de décision unique', () => {
  it('trois termes, tous requis', () => {
    expect(canAddToCart(produit())).toBe(true);
    expect(canAddToCart(produit({ forSale: false })), 'retiré de la vente').toBe(false);
    expect(canAddToCart(produit({ id: undefined })), 'DEBT-001 : sans id').toBe(false);
    expect(canAddToCart(produit({ priceNumber: undefined })), 'sans prix').toBe(false);
  });

  it('`undefined` et `null` ne sont jamais achetables — fail-closed sur l’entrée', () => {
    expect(canAddToCart(undefined)).toBe(false);
    expect(canAddToCart(null)).toBe(false);
  });

  it('`forSale` absent -> achetable : la question ne se pose pas hors `shop_products`', () => {
    const sans = produit();
    delete (sans as Record<string, unknown>).forSale;
    expect(canAddToCart(sans)).toBe(true);
  });
});

describe('DETTE 6c — `normalizeProduct` ne perd pas l’achetabilité en route', () => {
  // Editorial, Noir, Vif et Aurora appellent tous `.map(normalizeProduct)`.
  // Cette fonction RECONSTRUIT l'objet : un champ non recopié disparaît.
  // Sans ce transport, la correction n'aurait rien changé sur 4 vitrines sur 5.
  it('`forSale: false` survit à la normalisation', () => {
    expect(normalizeProduct({ id: 'p1', name: 'X', price: '1.00', priceNumber: 1, forSale: false }).forSale)
      .toBe(false);
  });

  it('`forSale: true` survit aussi', () => {
    expect(normalizeProduct({ id: 'p1', name: 'X', price: '1.00', priceNumber: 1, forSale: true }).forSale)
      .toBe(true);
  });

  it('un objet jsonb du Mode 1 (sans le champ) reste achetable après normalisation', () => {
    const n = normalizeProduct({ id: 'p1', name: 'Café', price: '4.50', priceNumber: 4.5 });
    expect(n.forSale).toBeUndefined();
    expect(canAddToCart(n)).toBe(true);
  });
});
