import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================
// Chantier Site Web / Mode 1 — Phase 1 (isolation).
// Verrouille les deux couplages niveau C identifies par le diagnostic
// d'isolation : le panier monte sans condition pour tous les modes, et le
// bloc Shop physiquement present dans le rendu des themes Mode 1.
//
// themes/shared.tsx importe @/lib/supabase (fetchSite/fetchSitePreview),
// jamais utilise par un rendu direct de composant en test -- mock minimal,
// meme principe que shipping-cache/__tests__/route.test.ts pour
// supabase-admin.
// ============================================================
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import EditorialTheme from '../EditorialTheme';
import VifTheme from '../VifTheme';
import CartShell from '../CartShell';
import { getCartLabels } from '../cartLabels';
import { getModeCapabilities } from '../modeCapabilities';

const THEMES_DIR = join(__dirname, '..');

type SiteOverrides = Record<string, unknown>;

function makeSite(overrides: SiteOverrides = {}): any {
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

function renderEditorial(site: any) {
  return renderToStaticMarkup(<EditorialTheme site={site} />);
}
function renderVif(site: any) {
  return renderToStaticMarkup(<VifTheme site={site} />);
}

describe('Rendu minimal Mode 1 — ne lève jamais d\'exception', () => {
  it('EditorialTheme rend un site Mode 1 minimaliste sans erreur', () => {
    expect(() => renderEditorial(makeSite())).not.toThrow();
  });

  it('VifTheme rend un site Mode 1 minimaliste sans erreur', () => {
    expect(() => renderVif(makeSite())).not.toThrow();
  });
});

describe('Sections essentielles Mode 1 — présentes dans le rendu réel', () => {
  it('EditorialTheme affiche le nom, le hero et les coordonnées de contact', () => {
    const html = renderEditorial(makeSite());
    expect(html).toContain('Entreprise Test');
    expect(html).toContain('id="about"');
    expect(html).toContain('id="contact"');
    expect(html).toContain('+15145550100');
  });

  it('VifTheme affiche le nom, le hero et les coordonnées de contact', () => {
    const html = renderVif(makeSite());
    expect(html).toContain('Entreprise Test');
    expect(html).toContain('id="about"');
    expect(html).toContain('id="contact"');
    expect(html).toContain('+15145550100');
  });
});

describe('CartShell — panier absent pour Mode 1, présent pour Mode 2/3', () => {
  const labels = getCartLabels('fr');

  function renderCartShell(mode: number | null, products: unknown[] | null) {
    return renderToStaticMarkup(
      <CartShell primary="#111111" labels={labels} slug="test" mode={mode} products={products} shippingFlat={0}>
        CONTENU
      </CartShell>
    );
  }

  it('Mode 1 : aucune trace du panier (aside du drawer) dans le rendu', () => {
    const html = renderCartShell(1, []);
    expect(html).not.toContain('<aside');
    expect(html).toBe('CONTENU');
  });

  it('Mode 1 avec des lignes "products" orphelines : le panier reste absent (mode fait toujours foi)', () => {
    const html = renderCartShell(1, [{ id: 'x', name: 'Orphelin', priceNumber: 10, currency: 'CAD' }]);
    expect(html).not.toContain('<aside');
  });

  it('Mode 2 avec au moins un produit : le panier est monté', () => {
    const html = renderCartShell(2, [{ id: 'p1', name: 'Produit', priceNumber: 10, currency: 'CAD' }]);
    expect(html).toContain('<aside');
  });

  it('Mode 2 sans aucun produit : le panier reste absent', () => {
    const html = renderCartShell(2, []);
    expect(html).not.toContain('<aside');
  });

  it('Mode 3 même sans produit chargé : le panier est monté (dropshipping, toujours actif)', () => {
    const html = renderCartShell(3, []);
    expect(html).toContain('<aside');
  });
});

describe('Shop — reste fonctionnel pour les modes qui en ont besoin', () => {
  // AddToCartButton exige un CartProvider (useCart() lève sinon) : on
  // englobe donc le thème dans CartShell, exactement comme le fait
  // sites/[slug]/page.tsx en production — un thème Mode 2/3 n'est jamais
  // rendu seul dans la vraie application.
  const labels = getCartLabels('fr');

  function renderWithCartShell(Theme: any, site: any) {
    return renderToStaticMarkup(
      <CartShell primary="#111111" labels={labels} slug={site.slug} mode={site.mode} products={site.products} shippingFlat={0}>
        <Theme site={site} />
      </CartShell>
    );
  }

  const product = { id: 'p1', name: 'Produit Vedette', priceNumber: 42, currency: 'CAD' };

  it('EditorialTheme Mode 2 avec produit : la section Shop et le produit apparaissent, panier fonctionnel', () => {
    const html = renderWithCartShell(EditorialTheme, makeSite({ mode: 2, products: [product] }));
    expect(html).toContain('id="shop"');
    expect(html).toContain('Produit Vedette');
    expect(html).toContain('href="#shop"');
    expect(html).toContain('<aside');
  });

  it('VifTheme Mode 3 même sans produit : la section Shop et le panier apparaissent (dropshipping toujours actif)', () => {
    const html = renderWithCartShell(VifTheme, makeSite({ mode: 3, products: [] }));
    expect(html).toContain('id="shop"');
    expect(html).toContain('<aside');
  });
});

describe('Bug ctaHref/MobileNav corrigés — jamais de lien #shop pour un site Mode 1', () => {
  it('EditorialTheme : aucun href="#shop" même avec des produits orphelins en base', () => {
    const html = renderEditorial(makeSite({ products: [{ id: 'x', name: 'Orphelin', priceNumber: 5, currency: 'CAD' }] }));
    expect(html).not.toContain('href="#shop"');
  });

  it('VifTheme : aucun href="#shop" même avec des produits orphelins en base', () => {
    const html = renderVif(makeSite({ products: [{ id: 'x', name: 'Orphelin', priceNumber: 5, currency: 'CAD' }] }));
    expect(html).not.toContain('href="#shop"');
  });
});

describe('getModeCapabilities — cohérence avec le rendu', () => {
  it('mode 1 : hasShop toujours faux, quel que soit le nombre de produits', () => {
    expect(getModeCapabilities({ mode: 1, products: [] }).hasShop).toBe(false);
    expect(getModeCapabilities({ mode: 1, products: [{}, {}] }).hasShop).toBe(false);
  });

  it('mode 2 : hasShop vrai seulement si au moins un produit', () => {
    expect(getModeCapabilities({ mode: 2, products: [] }).hasShop).toBe(false);
    expect(getModeCapabilities({ mode: 2, products: [{}] }).hasShop).toBe(true);
  });

  it('mode 3 : hasShop toujours vrai, même sans produit', () => {
    expect(getModeCapabilities({ mode: 3, products: [] }).hasShop).toBe(true);
    expect(getModeCapabilities({ mode: 3, products: null }).hasShop).toBe(true);
  });

  it('mode absent : traité comme mode 1 (repli sûr)', () => {
    expect(getModeCapabilities({ products: [{}] }).hasShop).toBe(false);
  });
});

describe('Frontière statique — le tronc commun Mode 1 ne référence jamais le panier', () => {
  // Verifie le CODE SOURCE, pas le rendu : protege contre l'ajout futur,
  // par erreur, d'un appel useCart()/AddToCartButton/ShippingEstimate
  // ailleurs dans le fichier que dans l'import de la section Shop extraite.
  // C'est le garde-fou qui manquait avant cette Phase 1 -- celui qui aurait
  // detecte le couplage diagnostique avant qu'il ne se produise.
  const FORBIDDEN_PATTERNS = [/\buseCart\s*\(/, /\bAddToCartButton\b/, /\bShippingEstimate\b/];

  function sourceWithoutShopImportLine(fileName: string): string {
    const raw = readFileSync(join(THEMES_DIR, fileName), 'utf8');
    return raw
      .split('\n')
      .filter((line) => !/^import .*ShopSection/.test(line.trim()))
      .join('\n');
  }

  it('EditorialTheme.tsx ne contient aucune référence directe au panier hors de l\'import de la section Shop', () => {
    const source = sourceWithoutShopImportLine('EditorialTheme.tsx');
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });

  it('VifTheme.tsx ne contient aucune référence directe au panier hors de l\'import de la section Shop', () => {
    const source = sourceWithoutShopImportLine('VifTheme.tsx');
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });

  it('MobileNav.tsx (partagé) ne référence jamais le panier', () => {
    const source = readFileSync(join(THEMES_DIR, 'MobileNav.tsx'), 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });
});
