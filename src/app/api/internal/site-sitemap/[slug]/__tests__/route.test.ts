import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/i18n/supportedLanguages';

// ============================================================
// CHANTIER 8 (MODE 1) — LE SITEMAP : MESURE, PAS SUPPOSITION.
//
// Le chantier nommait trois surfaces i18n. Deux en portaient réellement une :
// le panier et `llms.txt`. LE SITEMAP, NON — et c'est un CONSTAT MESURÉ,
// pas une omission :
//
//   * il n'émet que des URL, des dates, des `changefreq` et des `priority` —
//     aucun texte en langue naturelle, donc rien à traduire ;
//   * `hreflang` ne s'appliquerait pas : il déclare des ALTERNATIVES d'une
//     même page en plusieurs langues. Un site Woorri porte UNE langue et UNE
//     URL. Émettre `hreflang` ici déclarerait aux moteurs des variantes qui
//     n'existent pas — une affirmation fausse, pire que rien.
//
// Ce fichier ne corrige donc rien : il VERROUILLE le constat. Si un jour un
// intitulé en langue naturelle entre dans ce sitemap, ces tests échouent —
// exactement ce qui manquait à `llms.txt`, où onze intitulés français ont pu
// s'installer sans que rien ne le signale.
//
// C'est aussi la PREMIÈRE couverture de cette route (préfixe vitest ajouté).
// ============================================================

let siteRow: Record<string, unknown> | null;

vi.mock('@/app/sites/[slug]/themes/shared', () => ({
  fetchSite: async () => siteRow,
  resolveSiteBaseUrl: () => 'https://yiaglobalcommodities.com',
  WOORRI_SITE_URL: 'https://www.deribfy.com',
}));
vi.mock('@/lib/anomaly', () => ({ logAnomaly: vi.fn() }));

function site(over: Record<string, unknown> = {}) {
  return {
    id: 'site-1', slug: 'yia', name: 'YIA Global Commodities', mode: 1,
    created_at: '2026-01-15T00:00:00.000Z', lang: 'en', products: [],
    ...over,
  };
}

async function xml() {
  const { GET } = await import('../route');
  const res = await GET(new Request('https://yiaglobalcommodities.com/sitemap.xml'), {
    params: Promise.resolve({ slug: 'yia' }),
  });
  return { statut: res.status, texte: await res.text(), type: res.headers.get('Content-Type') };
}

beforeEach(() => { siteRow = site(); });

describe('CHANTIER 8 — 🔒 CLIQUET : le sitemap est INVARIANT par la langue', () => {
  it('les quatre langues produisent un XML RIGOUREUSEMENT identique', async () => {
    const rendus = new Set<string>();
    for (const lang of SUPPORTED_LANGUAGE_CODES) {
      siteRow = site({ lang });
      rendus.add((await xml()).texte);
    }
    expect(rendus.size, 'le sitemap dépend de la langue — il ne devrait pas').toBe(1);
  });

  it('une langue absente ou inconnue ne change rien non plus', async () => {
    siteRow = site({ lang: 'en' });
    const reference = (await xml()).texte;
    for (const lang of [null, undefined, '', 'de', 'fr-FR', 42]) {
      siteRow = site({ lang });
      expect((await xml()).texte, String(lang)).toBe(reference);
    }
  });

  it('🔴 AUCUN texte en langue naturelle n’est émis', async () => {
    // Le défaut de `llms.txt` était exactement celui-là, non détecté pendant
    // des mois. Ici on le rend impossible à installer en silence.
    const { texte } = await xml();
    for (const mot of ['propos', 'Questions', 'Téléphone', 'Adresse', 'Accueil',
                       'About', 'Contact', 'Products', 'Produits', 'Deribfy']) {
      expect(texte, `texte en langue naturelle : « ${mot} »`).not.toContain(mot);
    }
  });

  it('🔴 aucun hreflang n’est déclaré — il n’existe aucune variante à annoncer', async () => {
    const { texte } = await xml();
    expect(texte).not.toContain('hreflang');
    expect(texte).not.toContain('xhtml:link');
  });

  it('le sitemap ne porte que les balises attendues', async () => {
    const { texte } = await xml();
    const balises = new Set([...texte.matchAll(/<([a-z:]+)[ >]/g)].map((m) => m[1]));
    expect([...balises].sort()).toEqual(['changefreq', 'lastmod', 'loc', 'priority', 'url', 'urlset']);
  });
});

describe('CHANTIER 8 — première couverture : le contrat de la route tient', () => {
  it('un site publié rend un urlset XML valide avec son URL racine', async () => {
    const { statut, texte, type } = await xml();
    expect(statut).toBe(200);
    expect(type).toContain('application/xml');
    expect(texte.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(texte).toContain('<loc>https://yiaglobalcommodities.com</loc>');
    expect(texte.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  it('un site introuvable rend 404, jamais un XML vide', async () => {
    siteRow = null;
    expect((await xml()).statut).toBe(404);
  });

  it('les produits publiés obtiennent leur URL, les produits sans id sont ignorés', async () => {
    siteRow = site({ mode: 2, products: [{ id: 'p1' }, { id: null }, {}] });
    const { texte } = await xml();
    expect(texte).toContain('/produits/p1');
    expect([...texte.matchAll(/<url>/g)]).toHaveLength(2);
  });

  it('INVARIANT MODE 1 — une vitrine n’expose AUCUNE URL de produit', async () => {
    siteRow = site({ mode: 1, products: [] });
    const { texte } = await xml();
    expect(texte).not.toContain('/produits/');
    expect([...texte.matchAll(/<url>/g)]).toHaveLength(1);
  });
});
