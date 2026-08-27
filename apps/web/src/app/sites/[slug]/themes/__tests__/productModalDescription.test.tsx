// SEC-09 -- catalog_products.description (fournisseur tiers CJ, marketplace
// multi-vendeurs, ou reecriture IA via catalog/enhance) etait rendu via
// dangerouslySetInnerHTML dans ProductModal.tsx, sans sanitisation. Verifie
// sur 33 041 descriptions reelles en production (audit) : zero balisage
// HTML present -- MerchantProductModal.tsx traite deja la meme donnee en
// texte pur, meme pattern applique ici. Rendu reel via renderToStaticMarkup
// (pas une simple lecture du code source), meme methodologie que
// shop-product-guard.test.tsx (DEBT-001).
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ProductModal from '../ProductModal';
import { CartProvider } from '../CartContext';

function makeProduct(description: string) {
  return {
    id: 'catalog-prod-1',
    supplier_id: 'cj',
    supplier_product_id: 'v1',
    name: 'Produit test',
    description,
    price: 19.99,
    images: ['https://example.com/img.jpg'],
    shipping_days_min: 7,
    shipping_days_max: 14,
    warehouse_country: 'CN',
  };
}

function renderModal(description: string) {
  return renderToStaticMarkup(
    <CartProvider>
      <ProductModal product={makeProduct(description)} primary="#111111" lang="fr" onClose={() => {}} slug="test-shop" />
    </CartProvider>
  );
}

describe('ProductModal -- description rendue en texte pur (SEC-09)', () => {
  it("un payload <script> n'est jamais execute -- reste du texte litteral echappe dans le HTML final", () => {
    const html = renderModal('<script>window.__xss = true;</script>');
    // Aucune vraie balise <script> executable dans le HTML genere : React
    // echappe automatiquement, le marqueur doit apparaitre encode.
    expect(html).not.toContain('<script>window.__xss');
    expect(html).toContain('&lt;script&gt;');
  });

  it("un payload avec gestionnaire d'evenement (onerror) n'est jamais interprete comme un attribut HTML", () => {
    const html = renderModal('<img src=x onerror=alert(1)>');
    expect(html).not.toMatch(/<img[^>]*onerror=/);
    expect(html).toContain('&lt;img');
  });

  it('dangerouslySetInnerHTML absent du code executable de ce composant (verification structurelle directe, ignore les commentaires)', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../ProductModal.tsx'),
      'utf-8'
    );
    // Verifie la forme JSX reelle (attribut avec accolade ouvrante), pas la
    // simple sous-chaine -- un commentaire expliquant CE QUI N'EST PLUS fait
    // ne doit pas faire echouer ce test.
    expect(src).not.toMatch(/dangerouslySetInnerHTML=\{\{/);
  });

  it('un texte legitime avec retours a la ligne reste lisible (whiteSpace: pre-wrap, pas de regression fonctionnelle)', () => {
    const html = renderModal('Ligne 1\nLigne 2');
    expect(html).toContain('Ligne 1');
    expect(html).toContain('Ligne 2');
    expect(html).toContain('pre-wrap');
  });

  it('description absente -- aucune section Description rendue (comportement existant preserve)', () => {
    const html = renderToStaticMarkup(
      <CartProvider>
        <ProductModal
          product={{ ...makeProduct(''), description: undefined }}
          primary="#111111"
          lang="fr"
          onClose={() => {}}
          slug="test-shop"
        />
      </CartProvider>
    );
    expect(html).not.toContain('Description');
  });
});
