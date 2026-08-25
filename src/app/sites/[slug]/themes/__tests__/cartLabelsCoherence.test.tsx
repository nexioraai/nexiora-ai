import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/i18n/supportedLanguages';
import { getCartLabels } from '../cartLabels';
import { getDict } from '../i18n';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import EditorialTheme from '../EditorialTheme';
import VifTheme from '../VifTheme';
import NoirTheme from '../NoirTheme';
import AuroraTheme from '../AuroraTheme';
import { CartProvider } from '../CartContext';
import type { Site } from '../shared';

// ============================================================
// CHANTIER 8 (MODE 1) — LE PANIER ET LA PAGE, SUR LE MÊME ÉCRAN.
//
// `getCartLabels` ne normalisait pas alors que `getDict` le fait, et leurs
// replis divergeaient ('fr' contre 'en'). Deux surfaces d'une MÊME page
// pouvaient donc s'afficher en deux langues. Ces tests le vérifient sur le
// rendu réel des quatre thèmes, pas sur les seules fonctions.
// ============================================================

function makeSite(over: Record<string, unknown> = {}): Site {
  return {
    id: 'site-1', slug: 'boutique', name: 'Ma Boutique', mode: 2, lang: 'fr',
    hidden_sections: [], hero_title: 'Bienvenue', about: 'Notre histoire.',
    contact: { phone: '+1', email: 'a@b.c' }, social_links: {},
    testimonials: [], sections: [], gallery: [], faq: [], whyus: [],
    products: [{ id: 'p1', name: 'Article', price: '12 EUR', priceNumber: 12, currency: 'EUR', image: 'https://cdn.test/a.jpg', forSale: true, published: true }],
    ...over,
  } as unknown as Site;
}

const THEMES = [
  ['Editorial', (s: Site) => renderToStaticMarkup(<CartProvider><EditorialTheme site={s} /></CartProvider>)],
  ['Vif', (s: Site) => renderToStaticMarkup(<CartProvider><VifTheme site={s} /></CartProvider>)],
  ['Noir', (s: Site) => renderToStaticMarkup(<CartProvider><NoirTheme site={s} /></CartProvider>)],
  ['Aurora', (s: Site) => renderToStaticMarkup(<CartProvider><AuroraTheme site={s} /></CartProvider>)],
] as const;

describe('CHANTIER 8 — panier et chrome parlent la même langue, au rendu', () => {
  for (const code of SUPPORTED_LANGUAGE_CODES) {
    it(`« ${code} » : le bouton d’ajout et le libellé Contact viennent de la même langue`, () => {
      for (const [nom, rendu] of THEMES) {
        const html = rendu(makeSite({ lang: code }));
        expect(html, `${nom}/${code} : bouton panier`).toContain(getCartLabels(code).addToCart);
        expect(html, `${nom}/${code} : chrome`).toContain(getDict(code).nav.contact);
      }
    });
  }

  it('🔴 L’ASYMÉTRIE CORRIGÉE : « fr-FR » ne mélange plus les deux langues', () => {
    // Avant : la page en français (getDict normalise), le panier en anglais
    // (getCartLabels ne normalisait pas). Même page, même instant.
    for (const [nom, rendu] of THEMES) {
      const html = rendu(makeSite({ lang: 'fr-FR' }));
      expect(html, `${nom} : panier`).toContain(getCartLabels('fr').addToCart);
      expect(html, `${nom} : chrome`).toContain(getDict('fr').nav.contact);
      expect(html, `${nom} : anglais résiduel`).not.toContain(getCartLabels('en').addToCart);
    }
  });

  it('🔴 L’ASYMÉTRIE CORRIGÉE : lang absent donne un panier ANGLAIS, comme le reste', () => {
    // Avant : page anglaise, panier français.
    for (const [nom, rendu] of THEMES) {
      const html = rendu(makeSite({ lang: null }));
      expect(html, `${nom} : panier`).toContain(getCartLabels('en').addToCart);
      expect(html, `${nom} : français résiduel`).not.toContain(getCartLabels('fr').addToCart);
    }
  });

  it('🔴 les quatre langues produisent quatre rendus distincts', () => {
    for (const [nom, rendu] of THEMES) {
      const vus = new Set(SUPPORTED_LANGUAGE_CODES.map((c) => rendu(makeSite({ lang: c }))));
      expect(vus.size, `${nom} : le rendu ne dépend pas de lang`).toBe(4);
    }
  });

  it('une langue inconnue retombe sur l’anglais sans casser le rendu', () => {
    for (const [nom, rendu] of THEMES) {
      const html = rendu(makeSite({ lang: 'de' }));
      expect(html, nom).toContain(getCartLabels('en').addToCart);
      expect(html, nom).toContain('id="contact"');
    }
  });
});

describe('CHANTIER 8 — INVARIANTS MODE 1', () => {
  it('🔴 un site Mode 1 ne montre AUCUN libellé de panier, dans aucune langue', () => {
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      for (const [nom, rendu] of THEMES) {
        const html = rendu(makeSite({ mode: 1, lang: code, products: [] }));
        expect(html, `${nom}/${code}`).not.toContain(getCartLabels(code).addToCart);
        expect(html, `${nom}/${code}`).not.toContain(getCartLabels(code).checkout);
      }
    }
  });

  it('Mode 1 reste non transactionnel', async () => {
    const { canTransact } = await import('@/lib/commerce-admission/canTransact');
    expect(canTransact(1)).toBe(false);
    expect(canTransact(2)).toBe(true);
    expect(canTransact(3)).toBe(true);
  });

  it('le chrome du site reste traduit en Mode 1 — seul le panier disparaît', () => {
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      for (const [nom, rendu] of THEMES) {
        const html = rendu(makeSite({ mode: 1, lang: code, products: [] }));
        expect(html, `${nom}/${code}`).toContain(getDict(code).nav.contact);
      }
    }
  });
});
