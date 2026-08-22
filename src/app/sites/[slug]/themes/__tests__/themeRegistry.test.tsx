// Vérifie que themeRegistry.ts décrit la RÉALITÉ du rendu, pas une
// intention qui pourrait dériver silencieusement au fil du temps :
// pour chaque thème 'sequential', rend le composant réel (Mode 3, avec
// produit, pour maximiser la visibilité du Shop) et confirme que chaque
// id déclaré dans sectionOrder apparaît bien dans le HTML, dans l'ordre
// déclaré.
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import EditorialTheme from '../EditorialTheme';
import VifTheme from '../VifTheme';
import NoirTheme from '../NoirTheme';
import AuroraTheme from '../AuroraTheme';
import CartShell from '../CartShell';
import { getCartLabels } from '../cartLabels';
import { THEME_REGISTRY, getThemeMetadata } from '../themeRegistry';
import { checkSectionOrder } from '../checkSectionOrder';

const THEMES: Record<string, any> = { editorial: EditorialTheme, vif: VifTheme, noir: NoirTheme, aurora: AuroraTheme };

function makeSite(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'site-1',
    slug: 'entreprise-test',
    name: 'Entreprise Test',
    mode: 3,
    lang: 'fr',
    hidden_sections: [],
    hero_title: 'Bienvenue',
    about: 'Description.',
    contact: { phone: '+15145550100', email: 'contact@test.com', address: '123 rue Test' },
    social_links: {},
    testimonials: [{ name: 'Client Test', text: 'Excellent service.', rating: 5 }],
    sections: [],
    products: [{ id: 'p1', name: 'Produit Vedette', priceNumber: 42, currency: 'CAD' }],
    gallery: ['https://example.com/1.jpg'],
    dropship_type: 'reseller',
    faq: [{ question: 'Question test ?', answer: 'Réponse test.' }],
    ...overrides,
  };
}

function renderWithCartShell(Theme: any, site: any) {
  const labels = getCartLabels('fr');
  return renderToStaticMarkup(
    <CartShell primary="#111111" labels={labels} slug={site.slug} mode={site.mode} products={site.products} shippingFlat={0}>
      <Theme site={site} />
    </CartShell>
  );
}

describe('THEME_REGISTRY — intégrité déclarative', () => {
  it('un identifiant par thème réellement présent dans src/app/sites/[slug]/themes/', () => {
    for (const t of THEME_REGISTRY) {
      expect(THEMES[t.id], `theme "${t.id}" du registre introuvable dans THEMES`).toBeDefined();
    }
  });

  it('aucun id de thème dupliqué', () => {
    const ids = THEME_REGISTRY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getThemeMetadata retrouve chaque thème enregistré', () => {
    for (const t of THEME_REGISTRY) {
      expect(getThemeMetadata(t.id)?.id).toBe(t.id);
    }
  });
});

describe('THEME_REGISTRY — sectionOrder reflète le rendu réel (thèmes "sequential")', () => {
  const sequentialThemes = THEME_REGISTRY.filter((t) => t.layout === 'sequential');

  it.each(sequentialThemes.map((t) => [t.id, t]))('%s : chaque section déclarée apparaît, dans le bon ordre', (_id, theme) => {
    const html = renderWithCartShell(THEMES[theme.id], makeSite());
    const result = checkSectionOrder(html, theme.sectionOrder);
    expect(result.missing, `sections absentes du rendu de ${theme.id} (registre désynchronisé du code réel)`).toEqual([]);
    expect(result.outOfOrder, `l'ordre réel des sections de ${theme.id} ne correspond plus à sectionOrder`).toBe(false);
  });
});

describe('THEME_REGISTRY — Aurora (layout shop-swap, structure différente)', () => {
  it('rend sans erreur et affiche id="home" en Mode 3 avec produit', () => {
    const html = renderWithCartShell(AuroraTheme, makeSite());
    expect(html).toContain('id="home"');
    // Preuve que le swap catalogue a bien lieu (StorefrontDense affiche le produit).
    expect(html).toContain('Produit Vedette');
  });
});
