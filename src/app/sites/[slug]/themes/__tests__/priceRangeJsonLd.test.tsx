import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRICE_RANGE_VALUES } from '@/lib/site-profile/priceRange';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import JsonLd from '../JsonLd';
import NoirTheme from '../NoirTheme';
import { CartProvider } from '../CartContext';
import type { Site } from '../shared';

// ============================================================
// CHANTIER 5 (MODE 1) — CE QUE LES DEUX CHAMPS PRODUISENT À L'ÉCRAN.
//
// `price_range` alimente `schema.org/priceRange` et l'unique surface de
// rendu qui l'affiche (`NoirTheme:188`). `area_served` alimente
// `schema.org/areaServed` et `llms.txt`. Ces tests vérifient que le contrat
// du chantier 5 sort correctement des deux bouts.
// ============================================================

function makeSite(over: Record<string, unknown> = {}): Site {
  return {
    id: 'site-1', slug: 'yia', name: 'YIA Global Commodities', mode: 1, lang: 'en',
    hidden_sections: [], hero_title: 'Premium Sesame', about: 'Chad to North America.',
    contact: { phone: '+1', email: 'a@b.c' }, social_links: {},
    testimonials: [], sections: [], products: [], gallery: [], faq: [], whyus: [],
    area_served: 'Chad', price_range: '$$', type: 'import export',
    ...over,
  } as unknown as Site;
}

const ld = (s: Site) => renderToStaticMarkup(<JsonLd site={s} url="https://yiaglobalcommodities.com" />);

describe('CHANTIER 5 — price_range dans le JSON-LD', () => {
  for (const v of PRICE_RANGE_VALUES) {
    it(`« ${v} » est émis tel quel en priceRange`, () => {
      const html = ld(makeSite({ price_range: v }));
      expect(html).toContain(`"priceRange":"${v}"`);
    });
  }

  it('absent ou vide : la clé priceRange n’est pas émise', () => {
    for (const v of [null, undefined, '']) {
      expect(ld(makeSite({ price_range: v })), String(v)).not.toContain('priceRange');
    }
  });

  it('🔴 les quatre valeurs produisent quatre JSON-LD distincts', () => {
    const vus = new Set(PRICE_RANGE_VALUES.map((v) => ld(makeSite({ price_range: v }))));
    expect(vus.size).toBe(4);
  });
});

describe('CHANTIER 5 — area_served dans le JSON-LD', () => {
  it('la zone est émise en areaServed', () => {
    expect(ld(makeSite({ area_served: 'Grand Montréal' }))).toContain('"areaServed":"Grand Montréal"');
  });

  it('une zone non latine survit à la sérialisation', () => {
    expect(ld(makeSite({ area_served: 'الدار البيضاء' }))).toContain('areaServed');
  });

  it('absente : la clé n’est pas émise', () => {
    expect(ld(makeSite({ area_served: null }))).not.toContain('areaServed');
  });

  it('🔴 une valeur historique hostile reste échappée par JsonLdScript', () => {
    // Le chantier 5 ne retro-valide pas la base : une ligne ancienne peut
    // porter n'importe quoi. La classe est déjà couverte par M1-01, et on le
    // PROUVE ici plutôt que de le supposer.
    const html = ld(makeSite({ area_served: '</script><script>alert(1)</script>' }));
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('\\u003c');
  });
});

describe('CHANTIER 5 — price_range dans le seul thème qui l’affiche', () => {
  const rendu = (s: Site) => renderToStaticMarkup(<CartProvider><NoirTheme site={s} /></CartProvider>);

  for (const v of PRICE_RANGE_VALUES) {
    it(`Noir affiche « ${v} » dans ses statistiques`, () => {
      expect(rendu(makeSite({ price_range: v }))).toContain(v);
    });
  }

  it('absente : le thème rend sans casser', () => {
    const html = rendu(makeSite({ price_range: null }));
    expect(html).toContain('id="contact"');
  });
});
