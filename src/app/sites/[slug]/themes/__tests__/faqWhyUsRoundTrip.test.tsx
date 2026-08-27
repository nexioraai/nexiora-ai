import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import EditorialTheme from '../EditorialTheme';
import VifTheme from '../VifTheme';
import NoirTheme from '../NoirTheme';
import AuroraTheme from '../AuroraTheme';
import { CartProvider } from '../CartContext';
import type { Site } from '../shared';

// ============================================================
// CHANTIER 4 (MODE 1) — CE QUE L'AGENT ÉCRIT DOIT SE VOIR.
//
// La forme écrite par les six outils ({question,answer} et {title,text}) est
// exactement celle du générateur. Ces tests le prouvent en RENDANT les quatre
// thèmes sur la sortie littérale de la route, plutôt qu'en le supposant.
// ============================================================

/** La forme EXACTE que `apply/route.ts` écrit — recopiée, pas paraphrasée. */
const ECRIT_PAR_AGENT = {
  faq: [{ question: 'Do you ship to Canada?', answer: 'Yes, weekly consolidated freight.' }],
  whyus: [{ title: 'Direct sourcing', text: 'We buy from the cooperatives themselves.' }],
};

function makeSite(over: Record<string, unknown> = {}): Site {
  return {
    id: 'site-1', slug: 'yia', name: 'YIA Global Commodities', mode: 1, lang: 'en',
    hidden_sections: [], hero_title: 'Premium Sesame', hero_subtitle: 'from Chad',
    about: 'Bridges Chad producers with North American manufacturers.',
    contact: { phone: '+1', email: 'a@b.c' }, social_links: {},
    testimonials: [{ name: 'David Chen', text: 'Exceptional.' }],
    sections: [{ name: 'Our Products', items: [{ title: 'Sesame Seeds Grade A', description: 'd' }] }],
    products: [], gallery: [], ...ECRIT_PAR_AGENT, ...over,
  } as unknown as Site;
}

const THEMES = [
  ['Editorial', (s: Site) => renderToStaticMarkup(<CartProvider><EditorialTheme site={s} /></CartProvider>)],
  ['Vif', (s: Site) => renderToStaticMarkup(<CartProvider><VifTheme site={s} /></CartProvider>)],
  ['Noir', (s: Site) => renderToStaticMarkup(<CartProvider><NoirTheme site={s} /></CartProvider>)],
  ['Aurora', (s: Site) => renderToStaticMarkup(<CartProvider><AuroraTheme site={s} /></CartProvider>)],
] as const;

describe('CHANTIER 4 — la forme écrite par l’agent est rendue par les 4 thèmes', () => {
  for (const [nom, rendu] of THEMES) {
    it(`${nom} : la question ajoutée et sa réponse sont visibles`, () => {
      const html = rendu(makeSite());
      expect(html).toContain('Do you ship to Canada?');
      expect(html).toContain('Yes, weekly consolidated freight.');
    });

    it(`${nom} : l’argument « Pourquoi nous » ajouté est visible`, () => {
      const html = rendu(makeSite());
      expect(html).toContain('Direct sourcing');
      expect(html).toContain('We buy from the cooperatives themselves.');
    });

    it(`${nom} : 🔴 le masquage du chantier 2 tient toujours`, () => {
      const html = rendu(makeSite({ hidden_sections: ['FAQ'] }));
      expect(html).not.toContain('Do you ship to Canada?');
      // `whyus` ne dépend pas de ce réglage et ne doit pas disparaître avec.
      expect(html).toContain('Direct sourcing');
    });

    it(`${nom} : supprimer la dernière entrée retire la section, sans casser la page`, () => {
      const html = rendu(makeSite({ faq: [], whyus: [] }));
      expect(html).not.toContain('id="faq"');
      expect(html).not.toContain('Direct sourcing');
      expect(html).toContain('id="contact"');
    });

    it(`${nom} : un texte hostile est échappé par React, jamais rendu comme balise`, () => {
      const html = rendu(makeSite({
        faq: [{ question: '<img src=x onerror=alert(1)>', answer: 'A.' }],
        whyus: [{ title: '<b>Gras</b>', text: 'T.' }],
      }));
      expect(html).not.toContain('<img src=x onerror');
      expect(html).not.toContain('<b>Gras</b>');
      expect(html).toContain('&lt;img src=x onerror');
    });
  }
});

describe('CHANTIER 4 — llms.txt publie ce que l’agent a écrit', () => {
  async function texte(site: Record<string, unknown>) {
    vi.resetModules();
    vi.doMock('../shared', async (orig) => ({
      ...(await orig<Record<string, unknown>>()),
      fetchSite: async () => site,
      resolveSiteBaseUrl: () => 'https://yiaglobalcommodities.com',
    }));
    // La route tire `logAnomaly` -> `supabase-admin`, qui exige
    // SUPABASE_SERVICE_ROLE_KEY. Mesuré : sans ce mock, l'import échoue
    // avant toute assertion.
    vi.doMock('@/lib/anomaly', () => ({ logAnomaly: async () => {} }));
    vi.doMock('next/headers', () => ({ headers: async () => new Map([['host', 'yiaglobalcommodities.com']]) }));
    const { GET } = await import('../../llms.txt/route');
    const res = await GET(new Request('https://yiaglobalcommodities.com/llms.txt'), {
      params: Promise.resolve({ slug: 'yia' }),
    } as any);
    return res.text();
  }

  it('la question et l’argument ajoutés apparaissent dans la publication', async () => {
    const t = await texte(makeSite() as unknown as Record<string, unknown>);
    expect(t).toContain('Do you ship to Canada?');
    expect(t).toContain('Yes, weekly consolidated freight.');
    expect(t).toContain('Direct sourcing');
    expect(t).toContain('We buy from the cooperatives themselves.');
  });

  it('vidés, les deux blocs disparaissent — aucun titre orphelin', async () => {
    const t = await texte(makeSite({ faq: [], whyus: [] }) as unknown as Record<string, unknown>);
    expect(t).not.toContain('Questions fréquentes');
    expect(t).not.toContain('Pourquoi nous choisir');
  });
});
