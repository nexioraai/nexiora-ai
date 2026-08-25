import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { SUPPORTED_LANGUAGES, SUPPORTED_LANGUAGE_CODES } from '@/lib/i18n/supportedLanguages';
import { getDict } from '../i18n';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import EditorialTheme from '../EditorialTheme';
import VifTheme from '../VifTheme';
import NoirTheme from '../NoirTheme';
import AuroraTheme from '../AuroraTheme';
import { CartProvider } from '../CartContext';
import type { Site } from '../shared';

// ============================================================
// CHANTIER 3 (MODE 1) — CE QUE `lang` CHANGE RÉELLEMENT À L'ÉCRAN.
//
// Rendre `lang` éditable n'a d'intérêt que si l'éditer change quelque chose.
// Ces tests rendent les quatre thèmes dans les quatre langues et vérifient
// que le dictionnaire suit — puis vérifient les deux surfaces que le cas YIA
// a mises en cause : `og:locale` et l'attribut `lang` du document.
// ============================================================

const RACINE = join(__dirname, '..', '..', '..', '..', '..', '..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf8');

function makeSite(over: Record<string, unknown> = {}): Site {
  return {
    id: 'site-1', slug: 'yia', name: 'YIA Global Commodities', mode: 1, lang: 'en',
    hidden_sections: [], hero_title: 'Premium Sesame', hero_subtitle: 'from Chad',
    about: 'Bridges Chad producers with North American manufacturers.',
    contact: { phone: '+1', email: 'a@b.c' }, social_links: {},
    testimonials: [{ name: 'David Chen', text: 'Exceptional.' }],
    sections: [{ name: 'Our Products', items: [{ title: 'Sesame Seeds Grade A', description: 'd' }] }],
    products: [], gallery: [], faq: [{ question: 'MOQ?', answer: '500 kg.' }],
    ...over,
  } as unknown as Site;
}

const THEMES = [
  ['Editorial', (s: Site) => renderToStaticMarkup(<CartProvider><EditorialTheme site={s} /></CartProvider>)],
  ['Vif', (s: Site) => renderToStaticMarkup(<CartProvider><VifTheme site={s} /></CartProvider>)],
  ['Noir', (s: Site) => renderToStaticMarkup(<CartProvider><NoirTheme site={s} /></CartProvider>)],
  ['Aurora', (s: Site) => renderToStaticMarkup(<CartProvider><AuroraTheme site={s} /></CartProvider>)],
] as const;

describe('CHANTIER 3 — chaque langue rend RÉELLEMENT son dictionnaire', () => {
  for (const [nom, rendu] of THEMES) {
    it(`${nom} : les quatre langues produisent quatre rendus, et le bon libellé Contact`, () => {
      const vus = new Set<string>();
      for (const code of SUPPORTED_LANGUAGE_CODES) {
        const html = rendu(makeSite({ lang: code }));
        expect(html, `${nom}/${code} : libellé Contact absent`).toContain(getDict(code).nav.contact);
        vus.add(html);
      }
      // Quatre langues, quatre HTML distincts : si `lang` était ignoré, ce
      // Set en contiendrait un seul.
      expect(vus.size, `${nom} : le rendu ne dépend pas de lang`).toBe(4);
    });

    it(`${nom} : 🔴 la langue rendue n’est pas inversée — « fr » ne rend pas l’anglais`, () => {
      const fr = rendu(makeSite({ lang: 'fr' }));
      const en = rendu(makeSite({ lang: 'en' }));
      expect(fr).toContain(getDict('fr').nav.contact);
      expect(fr).not.toBe(en);
      expect(en).toContain(getDict('en').nav.contact);
    });

    it(`${nom} : une langue non supportée retombe sur l’anglais, sans casser le rendu`, () => {
      const html = rendu(makeSite({ lang: 'de' }));
      expect(html).toContain(getDict('en').nav.contact);
      expect(html).toContain('id="contact"');
    });
  }
});

describe('CHANTIER 3 — og:locale suit la langue du site', () => {
  async function metadata(lang: unknown) {
    vi.resetModules();
    // `page.tsx` importe `logAnomaly`, qui tire `supabase-admin` et exige
    // SUPABASE_SERVICE_ROLE_KEY. Mesure, pas supposition : sans ce mock,
    // l'import de la page échoue avant toute assertion.
    vi.doMock('@/lib/anomaly', () => ({ logAnomaly: async () => {} }));
    vi.doMock('next/headers', () => ({ headers: async () => new Map([['host', 'yiaglobalcommodities.com']]) }));
    vi.doMock('../shared', async (orig) => ({
      ...(await orig<Record<string, unknown>>()),
      fetchSite: async () => makeSite({ lang }),
      resolveSiteBaseUrl: () => 'https://yiaglobalcommodities.com',
    }));
    const { generateMetadata } = await import('../../page');
    return generateMetadata({ params: Promise.resolve({ slug: 'yia' }), searchParams: Promise.resolve({}) } as any);
  }

  for (const l of SUPPORTED_LANGUAGES) {
    it(`lang « ${l.code} » → og:locale ${l.ogLocale}`, async () => {
      const m = await metadata(l.code);
      expect(m.openGraph?.locale).toBe(l.ogLocale);
    });
  }

  it('🔴 LE CAS YIA : contenu anglais → en_US, plus jamais fr_FR en dur', async () => {
    const m = await metadata('en');
    expect(m.openGraph?.locale).toBe('en_US');
    expect(m.openGraph?.locale).not.toBe('fr_FR');
  });

  it('lang absent ou inconnu → en_US, la langue réellement rendue', async () => {
    for (const v of [null, undefined, 'de']) {
      expect((await metadata(v)).openGraph?.locale, String(v)).toBe('en_US');
    }
  });
});

describe('CHANTIER 3 — l’attribut lang du document reçoit site.lang', () => {
  // `HtmlLang` est un composant client : il pose `document.documentElement.lang`
  // dans un `useEffect`. Sans jsdom au dépôt, on verrouille le CÂBLAGE — que
  // la page lui transmet bien `site.lang` et que le composant écrive cette
  // valeur-là. C'est un constat STRUCTUREL, dit comme tel.
  it('page.tsx transmet site.lang à HtmlLang', () => {
    expect(lire('src/app/sites/[slug]/page.tsx')).toContain('<HtmlLang lang={site.lang} />');
  });

  it('HtmlLang écrit la valeur reçue sur documentElement.lang', () => {
    const src = lire('src/app/sites/[slug]/themes/HtmlLang.tsx');
    expect(src).toContain('document.documentElement.lang = lang');
    expect(src).toContain('[lang]');
  });
});

describe('CHANTIER 3 — le chemin d’écriture est unique et déjà existant', () => {
  it('l’éditeur n’ouvre AUCUNE seconde voie : lang passe par updateField', () => {
    const nav = lire('src/components/Navbar.tsx');
    expect(nav).toContain("updateField('lang', e.target.value)");
    expect(nav).toContain('updateOwnedSite(slug, site.owner_email, updates)');
    expect(nav.includes("fetch('/api/sites/") , 'une seconde voie a été créée').toBe(false);
  });

  it('lang n’est pas dans la denylist client — mode et dropship_type y restent', () => {
    const src = lire('src/lib/supabase-owned-site.ts');
    const bloc = src.slice(src.indexOf('SITE_FORBIDDEN_CLIENT_FIELDS = ['), src.indexOf(']', src.indexOf('SITE_FORBIDDEN_CLIENT_FIELDS = [')));
    expect(bloc).not.toContain("'lang'");
    expect(bloc, 'mode doit rester interdit au client').toContain("'mode'");
    expect(bloc).toContain("'dropship_type'");
  });

  it('la colonne lang est bien couverte par le GRANT UPDATE de la base', () => {
    expect(lire('supabase/sql/lot_g_final_field_level_authorization.sql')).toContain(' lang,');
  });

  it('l’éditeur n’offre que les langues du contrat', () => {
    const nav = lire('src/components/Navbar.tsx');
    expect(nav).toContain('SUPPORTED_LANGUAGES.map');
    for (const faux of ["'de'", "'pt'", "'it'", "'zh'"]) {
      expect(nav.includes(`value=${faux}`), faux).toBe(false);
    }
  });
});
