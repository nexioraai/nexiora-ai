import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import EditorialTheme from '../EditorialTheme';
import VifTheme from '../VifTheme';
import NoirTheme from '../NoirTheme';
import AuroraTheme from '../AuroraTheme';
import JsonLd from '../JsonLd';
import { CartProvider } from '../CartContext';
import type { Site } from '../shared';

// ============================================================
// CHANTIER 2 (MODE 1) — LA FAQ DEVIENT VISIBLE PARTOUT.
//
// LE DÉFAUT, MESURÉ SUR LE SITE RÉEL. `JsonLd` émet `FAQPage` pour les QUATRE
// thèmes et `llms.txt` publie la FAQ — mais seul Editorial la RENDAIT. Sur
// yiaglobalcommodities.com (Mode 1, thème Vif), six questions complètes
// étaient servies à Google et aux crawlers LLM, et `id="faq"` était absent du
// HTML. Les règles Google Rich Results exigent que le contenu balisé soit
// visible sur la page : c'est un motif d'action manuelle.
//
// Ces tests RENDENT réellement les quatre thèmes (renderToStaticMarkup),
// jamais une lecture de source.
// ============================================================

/** Les six questions réelles de YIA, réduites à ce que le rendu lit. */
const FAQ_YIA = [
  { question: 'What certifications and documentation do you provide with each shipment?', answer: 'Every shipment includes a CoA.' },
  { question: 'What are the minimum order quantities?', answer: 'Sesame from 500 kg.' },
  { question: 'How long does shipping from Chad to North America typically take?', answer: 'Ocean freight 4–6 weeks.' },
  { question: 'Do you offer long-term supply contracts or exclusive sourcing agreements?', answer: 'Yes, multi-season contracts.' },
  { question: 'What payment terms do you offer?', answer: '50% upfront, 50% on bill of lading.' },
  { question: 'Are your sesame and gum arabic organic certified?', answer: 'Low-input traditional farming.' },
];

function makeSite(over: Record<string, unknown> = {}): Site {
  return {
    id: 'site-1', slug: 'yia', name: 'YIA Global Commodities', mode: 1, lang: 'en',
    hidden_sections: [], hero_title: 'Premium Sesame', hero_subtitle: 'from Chad',
    about: 'Bridges Chad producers with North American manufacturers.',
    contact: { phone: '+1', email: 'a@b.c' }, social_links: {},
    testimonials: [{ name: 'David Chen', text: 'Exceptional.' }],
    sections: [{ name: 'Our Products', items: [{ title: 'Sesame Seeds Grade A', description: 'd' }] }],
    products: [], gallery: [], faq: FAQ_YIA,
    ...over,
  } as unknown as Site;
}

const THEMES = [
  ['Editorial', (s: Site) => renderToStaticMarkup(<CartProvider><EditorialTheme site={s} /></CartProvider>)],
  ['Vif', (s: Site) => renderToStaticMarkup(<CartProvider><VifTheme site={s} /></CartProvider>)],
  ['Noir', (s: Site) => renderToStaticMarkup(<CartProvider><NoirTheme site={s} /></CartProvider>)],
  ['Aurora', (s: Site) => renderToStaticMarkup(<CartProvider><AuroraTheme site={s} /></CartProvider>)],
] as const;

describe('CHANTIER 2 — la FAQ est rendue par les QUATRE thèmes', () => {
  for (const [nom, rendu] of THEMES) {
    it(`${nom} : la section existe et porte les 6 questions de YIA`, () => {
      const html = rendu(makeSite());
      expect(html, 'section #faq absente').toContain('id="faq"');
      for (const q of FAQ_YIA) {
        expect(html, q.question.slice(0, 40)).toContain(q.question);
        expect(html, q.answer).toContain(q.answer);
      }
    });

    it(`${nom} : chaque question est un accordéon <details>, comme chez Editorial`, () => {
      const html = rendu(makeSite());
      const details = (html.match(/<details/g) ?? []).length;
      expect(details, 'un <details> par question attendu').toBeGreaterThanOrEqual(FAQ_YIA.length);
    });

    it(`${nom} : AUCUNE section FAQ quand \`faq\` est vide`, () => {
      for (const vide of [[], null, undefined]) {
        const html = rendu(makeSite({ faq: vide }));
        expect(html, String(vide)).not.toContain('id="faq"');
      }
    });

    it(`${nom} : 🔴 la FAQ est MASQUÉE quand hidden_sections contient « FAQ »`, () => {
      const html = rendu(makeSite({ hidden_sections: ['FAQ'] }));
      expect(html).not.toContain('id="faq"');
      expect(html).not.toContain(FAQ_YIA[0].question);
    });

    it(`${nom} : elle RÉAPPARAÎT dès que « FAQ » quitte hidden_sections`, () => {
      const masque = rendu(makeSite({ hidden_sections: ['FAQ'] }));
      const visible = rendu(makeSite({ hidden_sections: [] }));
      expect(masque).not.toContain('id="faq"');
      expect(visible).toContain('id="faq"');
    });

    it(`${nom} : masquer la FAQ ne touche AUCUNE autre section`, () => {
      const html = rendu(makeSite({ hidden_sections: ['FAQ'] }));
      expect(html, 'contact').toContain('id="contact"');
      expect(html, 'témoignages').toContain('David Chen');
      expect(html, 'à-propos').toContain('Bridges Chad producers');
    });

    it(`${nom} : masquer une AUTRE section ne masque pas la FAQ`, () => {
      const html = rendu(makeSite({ hidden_sections: ['Reviews'] }));
      expect(html).toContain('id="faq"');
    });
  }
});

describe('CHANTIER 2 — le balisage et la page disent la MÊME chose', () => {
  const ld = (s: Site) => renderToStaticMarkup(<JsonLd site={s} url="https://yiaglobalcommodities.com" />);

  it('FAQ remplie : `FAQPage` émis ET section visible dans les 4 thèmes', () => {
    const s = makeSite();
    expect(ld(s)).toContain('FAQPage');
    for (const [nom, rendu] of THEMES) expect(rendu(s), nom).toContain('id="faq"');
  });

  it('FAQ vide : ni balisage, ni section', () => {
    const s = makeSite({ faq: [] });
    expect(ld(s)).not.toContain('FAQPage');
    for (const [nom, rendu] of THEMES) expect(rendu(s), nom).not.toContain('id="faq"');
  });

  it('🟠 FAQ masquée : le balisage subsiste — limite CONNUE et assumée', () => {
    // `JsonLd` ne connaît pas le thème et ne lit pas `hidden_sections`. Un
    // marchand qui masque sa FAQ garde donc le `FAQPage`. Le cas n'existait
    // pas avant ce chantier (la FAQ n'était visible nulle part) ; il est
    // consigné ici plutôt que corrigé en silence, hors périmètre du plan gelé.
    const s = makeSite({ hidden_sections: ['FAQ'] });
    expect(ld(s)).toContain('FAQPage');
    for (const [nom, rendu] of THEMES) expect(rendu(s), nom).not.toContain('id="faq"');
  });
});

describe('CHANTIER 2 — INVARIANTS MODE 1', () => {
  it('aucune capacité commerciale n’apparaît sur une vitrine', () => {
    for (const [nom, rendu] of THEMES) {
      const html = rendu(makeSite());
      for (const interdit of ['Add to cart', 'Ajouter au panier', 'id="shop"', '/produits/']) {
        expect(html, `${nom} / ${interdit}`).not.toContain(interdit);
      }
    }
  });

  it('les Modes 2 et 3 rendent la FAQ de la même façon — aucune divergence', () => {
    for (const mode of [2, 3]) {
      for (const [nom, rendu] of THEMES) {
        expect(rendu(makeSite({ mode })), `${nom} mode ${mode}`).toContain('id="faq"');
      }
    }
  });
});
