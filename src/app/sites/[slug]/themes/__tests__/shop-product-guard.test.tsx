// DEBT-001 -- NoirShopSection et VifShopSection appelaient AddToCartButton
// sans jamais verifier que le produit avait un id/priceNumber valides,
// contrairement a EditorialShopSection qui le fait deja. Un produit orphelin
// (id manquant en base, cas reel : normalizeProduct renvoie id: undefined
// quand raw.id est absent) pouvait donc etre pousse dans le panier avec
// id: undefined, cassant la deduplication et potentiellement le checkout.
// Meme methodologie que les tests d'isolation : rendu reel via
// renderToStaticMarkup, jamais une simple lecture du code source.
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { CartProvider } from '../CartContext';
import NoirShopSection from '../NoirShopSection';
import VifShopSection from '../VifShopSection';
import EditorialShopSection from '../EditorialShopSection';
import type { Site } from '../shared';

function makeSite(overrides: Record<string, unknown> = {}): Site {
  return {
    id: 'site-1',
    slug: 'entreprise-test',
    name: 'Entreprise Test',
    mode: 2,
    lang: 'fr',
    hidden_sections: [],
    hero_title: 'Bienvenue',
    about: 'Une description.',
    contact: {},
    social_links: {},
    testimonials: [],
    sections: [],
    products: [],
    gallery: [],
    ...overrides,
  } as unknown as Site;
}

const ORPHAN = { name: 'Produit orphelin', price: '12.00', priceNumber: undefined, currency: 'CAD' };
const VALID = { id: 'p1', name: 'Produit complet', price: '12.00', priceNumber: 12, currency: 'CAD' };

function render(Section: typeof NoirShopSection, products: unknown[]) {
  return renderToStaticMarkup(
    <CartProvider>
      <Section site={makeSite({ products })} />
    </CartProvider>
  );
}

describe('DEBT-001 -- garde produit orphelin (id/priceNumber manquants)', () => {
  it('Noir : un produit sans id ne pousse pas un AddToCartButton, affiche "Demander" à la place', () => {
    const html = render(NoirShopSection, [ORPHAN]);
    expect(html).not.toContain('Ajouter au panier');
    expect(html).toContain('Demander');
    expect(html).toContain('href="#contact"');
  });

  it('Noir : un produit complet garde bien son AddToCartButton', () => {
    const html = render(NoirShopSection, [VALID]);
    expect(html).toContain('Ajouter au panier');
  });

  it('Vif : un produit sans id ne pousse pas un AddToCartButton, affiche "Demander" à la place', () => {
    const html = render(VifShopSection, [ORPHAN]);
    expect(html).not.toContain('Ajouter au panier');
    expect(html).toContain('Demander');
    expect(html).toContain('href="#contact"');
  });

  it('Vif : un produit complet garde bien son AddToCartButton', () => {
    const html = render(VifShopSection, [VALID]);
    expect(html).toContain('Ajouter au panier');
  });

  it('Editorial (référence, non modifié) : comportement inchangé sur un produit orphelin', () => {
    const html = renderToStaticMarkup(
      <CartProvider>
        <EditorialShopSection site={makeSite({ products: [ORPHAN] })} primary="#111111" />
      </CartProvider>
    );
    expect(html).not.toContain('Ajouter au panier');
    expect(html).toContain('Demander');
  });
});
