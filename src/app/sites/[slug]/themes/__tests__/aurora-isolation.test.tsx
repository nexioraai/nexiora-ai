// Bloc 4 — isolation Aurora. Structure différente des 3 autres thèmes :
// pas de section Shop ajoutée, le contenu principal bascule entièrement
// vers StorefrontDense (catalogue) au lieu du hero narratif quand hasShop
// est vrai. Les assertions reflètent cette structure réelle, pas celle
// des autres thèmes.
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import AuroraTheme from '../AuroraTheme';
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

function renderAurora(site: any) {
  return renderToStaticMarkup(<AuroraTheme site={site} />);
}

function renderWithCartShell(site: any) {
  const labels = getCartLabels('fr');
  return renderToStaticMarkup(
    <CartShell primary="#111111" labels={labels} slug={site.slug} mode={site.mode} products={site.products} shippingFlat={0}>
      <AuroraTheme site={site} />
    </CartShell>
  );
}

describe('Aurora — rendu minimal Mode 1, ne lève jamais d\'exception', () => {
  it('rend un site Mode 1 minimaliste sans erreur', () => {
    expect(() => renderAurora(makeSite())).not.toThrow();
  });
});

describe('Aurora — sections essentielles présentes en Mode 1', () => {
  it('affiche le hero narratif statique (pas StorefrontDense), le nom, le contact', () => {
    const html = renderAurora(makeSite());
    expect(html).toContain('Entreprise Test');
    expect(html).toContain('id="home"');
    expect(html).toContain('id="contact"');
    expect(html).toContain('+15145550100');
  });
});

describe('Aurora — Mode 1 ne bascule jamais vers le catalogue Shop', () => {
  it('pas de grille catalogue (StorefrontDense), même avec des produits orphelins en base', () => {
    const html = renderAurora(makeSite({ products: [{ id: 'x', name: 'Orphelin', priceNumber: 5, currency: 'CAD' }] }));
    // StorefrontDense affiche son propre id="shop" -- absent si le swap
    // catalogue n'a pas eu lieu.
    expect(html).not.toContain('id="shop"');
  });

  it('CartShell : aucune trace du panier pour un site Aurora en Mode 1', () => {
    const html = renderWithCartShell(makeSite({ products: [{ id: 'x', name: 'Orphelin', priceNumber: 5, currency: 'CAD' }] }));
    expect(html).not.toContain('<aside');
  });
});

describe('Aurora — bascule catalogue fonctionnelle pour les modes qui en ont besoin', () => {
  const product = { id: 'p1', name: 'Produit Vedette', priceNumber: 42, currency: 'CAD' };

  it('Mode 2 avec produit : bascule vers StorefrontDense, produit affiché, panier fonctionnel', () => {
    const html = renderWithCartShell(makeSite({ mode: 2, products: [product] }));
    expect(html).toContain('id="shop"');
    expect(html).toContain('Produit Vedette');
    expect(html).toContain('<aside');
  });

  it('Mode 3 même sans produit : bascule active (dropshipping toujours actif)', () => {
    const html = renderWithCartShell(makeSite({ mode: 3, products: [] }));
    expect(html).toContain('id="shop"');
    expect(html).toContain('<aside');
  });

  it('Mode 2 sans produit : pas de bascule catalogue', () => {
    const html = renderWithCartShell(makeSite({ mode: 2, products: [] }));
    expect(html).not.toContain('id="shop"');
    expect(html).not.toContain('<aside');
  });
});

describe('Aurora — cohérence avec getModeCapabilities (non-régression du correctif Bloc 4)', () => {
  it('un site Mode 1 avec produits orphelins garde hasShop=false et aucune trace catalogue', () => {
    const site = makeSite({ mode: 1, products: [{ id: 'x', name: 'Orphelin', priceNumber: 5, currency: 'CAD' }] });
    expect(getModeCapabilities(site).hasShop).toBe(false);
    const html = renderAurora(site);
    expect(html).not.toContain('id="shop"');
  });
});
