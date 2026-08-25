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
