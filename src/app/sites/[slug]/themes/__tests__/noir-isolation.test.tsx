// Bloc 4 — isolation Noir. Même méthodologie que mode1-isolation.test.tsx :
// rendu réel via renderToStaticMarkup, jamais une simple recherche de
// chaîne dans le code source pour juger du comportement fonctionnel.
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import NoirTheme from '../NoirTheme';
import CartShell from '../CartShell';
import { getCartLabels } from '../cartLabels';
import { getModeCapabilities } from '../modeCapabilities';

function makeSite(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'site-1',
    slug: 'entreprise-test',
    name: 'Entreprise Test',
    mode: 1,
    lang: 'fr',
    hidden_sections: [],
    hero_title: 'Bienvenue chez Entreprise Test',
    about: 'Une description authentique de notre activité.',
    contact: { phone: '+15145550100', email: 'contact@entreprise-test.com', address: '123 rue Test' },
    social_links: {},
    testimonials: [],
    sections: [],
    products: [],
    gallery: [],
    ...overrides,
  };
}

function renderNoir(site: any) {
  return renderToStaticMarkup(<NoirTheme site={site} />);
}

function renderWithCartShell(site: any) {
  const labels = getCartLabels('fr');
  return renderToStaticMarkup(
    <CartShell primary="#111111" labels={labels} slug={site.slug} mode={site.mode} products={site.products} shippingFlat={0}>
      <NoirTheme site={site} />
    </CartShell>
  );
}

describe('Noir — rendu minimal Mode 1, ne lève jamais d\'exception', () => {
  it('rend un site Mode 1 minimaliste sans erreur', () => {
    expect(() => renderNoir(makeSite())).not.toThrow();
  });
});

describe('Noir — sections essentielles présentes', () => {
  it('affiche le nom, le hero et les coordonnées de contact', () => {
    const html = renderNoir(makeSite());
    expect(html).toContain('Entreprise Test');
    expect(html).toContain('id="about"');
    expect(html).toContain('id="contact"');
    expect(html).toContain('+15145550100');
  });
});

describe('Noir — Mode 1 ne fait jamais apparaître le Shop', () => {
  it('aucune section id="shop", aucun href="#shop", même avec des produits orphelins en base', () => {
    const html = renderNoir(makeSite({ products: [{ id: 'x', name: 'Orphelin', priceNumber: 5, currency: 'CAD' }] }));
    expect(html).not.toContain('id="shop"');
    expect(html).not.toContain('href="#shop"');
  });

  it('CartShell : aucune trace du panier pour un site Noir en Mode 1', () => {
    const html = renderWithCartShell(makeSite({ products: [{ id: 'x', name: 'Orphelin', priceNumber: 5, currency: 'CAD' }] }));
    expect(html).not.toContain('<aside');
  });
});

describe('Noir — Shop reste fonctionnel pour les modes qui en ont besoin', () => {
  const product = { id: 'p1', name: 'Produit Vedette', priceNumber: 42, currency: 'CAD' };

  it('Mode 2 avec produit : section Shop, produit affiché, panier fonctionnel', () => {
    const html = renderWithCartShell(makeSite({ mode: 2, products: [product] }));
    expect(html).toContain('id="shop"');
    expect(html).toContain('Produit Vedette');
    expect(html).toContain('href="#shop"');
    expect(html).toContain('<aside');
  });

  it('Mode 3 même sans produit : Shop et panier actifs (dropshipping toujours actif)', () => {
    const html = renderWithCartShell(makeSite({ mode: 3, products: [] }));
    expect(html).toContain('id="shop"');
    expect(html).toContain('<aside');
  });

  it('Mode 2 sans produit : pas de Shop', () => {
    const html = renderWithCartShell(makeSite({ mode: 2, products: [] }));
    expect(html).not.toContain('id="shop"');
    expect(html).not.toContain('<aside');
  });
});

describe('Noir — cohérence avec getModeCapabilities (non-régression du correctif Bloc 4)', () => {
  it('les 3 anciens points de duplication (ctaHref, nav, section) sont désormais dérivés de la même source', () => {
    // Avant le Bloc 4, ces 3 points recalculaient chacun leur propre copie de
    // la meme expression -- ce test verifie qu'un site dont hasShop est faux
    // ne montre JAMAIS le lien Shop, ni dans le hero (ctaHref), ni dans la
    // nav desktop, ni en section, meme avec des produits orphelins.
    const site = makeSite({ mode: 1, products: [{ id: 'x', name: 'Orphelin', priceNumber: 5, currency: 'CAD' }] });
    expect(getModeCapabilities(site).hasShop).toBe(false);
    const html = renderNoir(site);
    expect(html).not.toContain('href="#shop"');
    expect(html).not.toContain('id="shop"');
  });
});
