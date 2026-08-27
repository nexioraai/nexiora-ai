import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// CHANTIER 1 (MODE 1) — llms.txt PUBLIE CE QUE LE SITE REND.
//
// Première couverture de cette route. Elle publiait `site.services`, colonne
// qu'aucun thème ne rend et que le générateur ne produit pas : sur
// yiaglobalcommodities.com, le bloc ne se déclenchait donc JAMAIS. Les six
// offres visibles par le visiteur étaient absentes du fichier destiné aux
// crawlers LLM, pendant que celui-ci publiait mission, vision et FAQ —
// contenus que le thème Vif, lui, n'affiche pas. L'inversion exacte.
// ============================================================

let siteRow: Record<string, unknown> | null;

// La route compose son texte à partir de `fetchSite`, jamais de Supabase
// directement : c'est donc `fetchSite` qu'on simule. Ce qui est sous test ici
// est la COMPOSITION du fichier, seule chose que ce chantier a changée.
vi.mock('../../themes/shared', () => ({
  fetchSite: async () => siteRow,
  resolveSiteBaseUrl: () => 'https://yiaglobalcommodities.com',
  WOORRI_SITE_URL: 'https://www.deribfy.com',
}));
vi.mock('@/lib/anomaly', () => ({ logAnomaly: vi.fn() }));

/** Les offres réelles de YIA, réduites à ce que la route lit. */
const SECTIONS_YIA = [
  {
    name: 'Our Products',
    items: [
      { title: 'Sesame Seeds Grade A' },
      { title: 'Gum Arabic Acacia Senegal' },
      { title: 'Sesame Seeds Bulk Orders (25MT containers)' },
      { title: 'Gum Arabic Wholesale Distribution' },
      { title: 'SGS Certificate of Analysis (CoA) Testing' },
      { title: 'Custom Sourcing & Farmer Partnerships' },
    ],
  },
];

function req() {
  return new Request('https://yiaglobalcommodities.com/llms.txt');
}

async function corps(): Promise<string> {
  const { GET } = await import('../route');
  const res = await GET(req() as any, { params: Promise.resolve({ slug: 'yia' }) } as any);
  return await res.text();
}

beforeEach(() => {
  siteRow = {
    id: 's1', slug: 'yia', name: 'YIA Global Commodities', mode: 1,
    slogan: 'Premium Chadian Commodities',
    about: 'Bridges Chad producers with North American manufacturers.',
    sections: JSON.parse(JSON.stringify(SECTIONS_YIA)),
    services: [],
    products: [],
    faq: [], whyus: [], contact: {},
  };
});

describe('CHANTIER 1 — les offres réelles sont publiées', () => {
  it('🔴 les 6 offres de YIA apparaissent, sous le nom réel de leur section', async () => {
    const t = await corps();
    expect(t).toContain('## Our Products');
    for (const offre of SECTIONS_YIA[0].items) {
      expect(t, offre.title).toContain('- ' + offre.title);
    }
  });

  it('plusieurs sections -> un bloc chacune, dans l’ordre du site', async () => {
    siteRow!.sections = [
      { name: 'Produits', items: [{ title: 'Sésame' }] },
      { name: 'Services', items: [{ title: 'Logistique' }] },
    ];
    const t = await corps();
    expect(t.indexOf('## Produits')).toBeGreaterThan(-1);
    expect(t.indexOf('## Services')).toBeGreaterThan(t.indexOf('## Produits'));
    expect(t).toContain('- Sésame');
    expect(t).toContain('- Logistique');
  });

  it('une section vide ne produit aucun bloc — pas de titre orphelin', async () => {
    siteRow!.sections = [{ name: 'Vide', items: [] }, ...SECTIONS_YIA];
    const t = await corps();
    expect(t).not.toContain('## Vide');
    expect(t).toContain('## Our Products');
  });

  it('une section sans nom retombe sur un libellé, jamais sur « undefined »', async () => {
    siteRow!.sections = [{ items: [{ title: 'Offre' }] }];
    const t = await corps();
    expect(t).toContain('- Offre');
    expect(t).not.toMatch(/##\s*(undefined|null)/);
  });
});

describe('CHANTIER 1 — la colonne legacy n’est plus publiée', () => {
  it('🔴 `services` rempli ne produit RIEN — seul `sections` fait foi', async () => {
    siteRow!.services = [{ title: 'Fantôme legacy' }];
    siteRow!.sections = [];
    const t = await corps();
    expect(t).not.toContain('Fantôme legacy');
  });

  it('quand les deux existent, seules les sections sont publiées', async () => {
    siteRow!.services = [{ title: 'Fantôme legacy' }];
    const t = await corps();
    expect(t).toContain('- Sesame Seeds Grade A');
    expect(t).not.toContain('Fantôme legacy');
  });
});

describe('CHANTIER 1 — non-régression du reste du fichier', () => {
  // CHANTIER 8 — CE TEST GARDE SON INTENTION, IL CHANGE D'ANCRE.
  //
  // Il vérifiait que le bloc à-propos est publié, et s'ancrait pour cela sur
  // « ## À propos » — un intitulé écrit en dur en français que le chantier 8
  // supprime. La fixture n'a pas de `lang` : le fichier retombe désormais sur
  // l'anglais, comme `getDict` le fait déjà pour la page elle-même. On ancre
  // donc sur le CONTENU publié, qui est ce que le test veut réellement
  // constater, et l'intitulé est vérifié pour ce qu'il est — une traduction —
  // dans les tests dédiés du chantier 8.
  it('le nom, le slogan et l’à-propos restent publiés', async () => {
    const t = await corps();
    expect(t).toContain('# YIA Global Commodities');
    expect(t).toContain('Premium Chadian Commodities');
    expect(t).toContain('Bridges Chad producers with North American manufacturers.');
    expect(t).toMatch(/^## (À propos|About)$/m);
  });

  it('INVARIANT MODE 1 — aucun vocabulaire commercial n’apparaît', async () => {
    const t = await corps();
    for (const interdit of ['panier', 'Ajouter au panier', 'checkout', '/produits/']) {
      expect(t, interdit).not.toContain(interdit);
    }
  });
});

// ============================================================
// CHANTIER 8 (MODE 1) — LE FICHIER PARLE LA LANGUE DU SITE.
//
// Onze intitulés étaient écrits EN DUR EN FRANÇAIS. Mesuré sur
// yiaglobalcommodities.com (`lang = 'en'`, contenu intégralement anglais) :
// le fichier servi aux crawlers LLM encadrait du texte anglais de titres
// français — « ## À propos », « ## Questions fréquentes », « - Téléphone : ».
// Ce fichier existe pour être lu par des machines qui en tirent une
// compréhension du commerce.
//
// Ces tests exercent la ROUTE, sur le texte réellement servi.
// ============================================================

/** Ce que le fichier doit porter, langue par langue, sur le site de YIA. */
const ATTENDUS: Record<string, string[]> = {
  en: ['## About', '## Frequently asked questions', '## Why choose us', '- Phone : ', '## Area served', 'Last updated : '],
  fr: ['## À propos', '## Questions fréquentes', '## Pourquoi nous choisir', '- Téléphone : ', '## Zone desservie', 'Dernière mise à jour : '],
  es: ['## Acerca de', '## Preguntas frecuentes', '## Por qué elegirnos', '- Teléfono : ', '## Zona de servicio', 'Última actualización : '],
  ar: ['## نبذة عنا', '## الأسئلة الشائعة', '## لماذا تختارنا', '- الهاتف : ', '## منطقة الخدمة', 'آخر تحديث : '],
};

describe('CHANTIER 8 — les intitulés suivent site.lang', () => {
  for (const [lang, attendus] of Object.entries(ATTENDUS)) {
    it(`« ${lang} » : le fichier porte ses propres intitulés`, async () => {
      // `created_at` fourni : sans lui la ligne « dernière mise à jour »
      // n'est pas émise du tout, et l'assertion porterait sur rien.
      siteRow = { ...siteRow, lang, created_at: '2026-01-15T00:00:00.000Z', faq: [{ question: 'MOQ?', answer: '500 kg.' }], whyus: [{ title: 'T', text: 'X' }], area_served: 'Chad', contact: { phone: '+1' } };
      const t = await corps();
      for (const a of attendus) expect(t, `${lang} : « ${a} » absent`).toContain(a);
    });
  }

  it('🔴 LE CAS YIA : un site anglais ne reçoit AUCUN intitulé français', async () => {
    siteRow = { ...siteRow, lang: 'en', created_at: '2026-01-15T00:00:00.000Z', mission: 'M', vision: 'V', products: [{ name: 'P' }], faq: [{ question: 'MOQ?', answer: '500 kg.' }], whyus: [{ title: 'T', text: 'X' }], area_served: 'Chad', contact: { phone: '+1', email: 'a@b.c', address: 'X' } };
    const t = await corps();
    for (const francais of ['## À propos', '## Questions fréquentes', '## Pourquoi nous choisir',
                            '## Zone desservie', '## Notre mission', '## Produits', '## Site web',
                            '- Téléphone', '- Adresse', 'Dernière mise à jour']) {
      expect(t, `intitulé français survivant : « ${francais} »`).not.toContain(francais);
    }
  });

  it('🔴 les quatre langues produisent quatre fichiers DISTINCTS', async () => {
    const vus = new Set<string>();
    for (const lang of ['en', 'fr', 'es', 'ar']) {
      siteRow = { ...siteRow, lang };
      vus.add(await corps());
    }
    expect(vus.size, 'le fichier ne dépend pas de la langue').toBe(4);
  });

  it('une langue inconnue, vide ou absente retombe sur l’anglais', async () => {
    for (const lang of ['de', 'zz', '', null, undefined]) {
      siteRow = { ...siteRow, lang };
      const t = await corps();
      expect(t, String(lang)).toContain('## About');
      expect(t, String(lang)).not.toContain('## À propos');
    }
  });

  it('une variante régionale est normalisée comme sur la page', async () => {
    siteRow = { ...siteRow, lang: 'fr-FR' };
    expect(await corps()).toContain('## À propos');
  });
});

describe('CHANTIER 8 — AUCUN contenu du marchand n’est traduit', () => {
  it('le nom des sections reste celui que le site affiche — règle du chantier 1 intacte', async () => {
    siteRow = { ...siteRow, lang: 'ar', sections: [{ name: 'Our Products', items: [{ title: 'Sesame Seeds Grade A' }] }] };
    const t = await corps();
    expect(t, 'le nom de section a été traduit').toContain('## Our Products');
    expect(t).toContain('- Sesame Seeds Grade A');
  });

  it('le texte du marchand traverse intact, quelle que soit la langue', async () => {
    for (const lang of ['en', 'fr', 'es', 'ar']) {
      siteRow = {
        ...siteRow, lang,
        about: 'Bridges Chad producers with North American manufacturers.',
        faq: [{ question: 'What are the minimum order quantities?', answer: 'Sesame from 500 kg.' }],
      };
      const t = await corps();
      expect(t, lang).toContain('Bridges Chad producers with North American manufacturers.');
      expect(t, lang).toContain('What are the minimum order quantities?');
      expect(t, lang).toContain('Sesame from 500 kg.');
    }
  });

  it('une section SANS nom retombe sur un libellé traduit, jamais sur « undefined »', async () => {
    for (const [lang, attendu] of [['en', '## Services'], ['es', '## Servicios'], ['ar', '## الخدمات']] as const) {
      siteRow = { ...siteRow, lang, sections: [{ items: [{ title: 'Une offre' }] }] };
      const t = await corps();
      expect(t, lang).toContain(attendu);
      expect(t, lang).not.toContain('undefined');
    }
  });
});

describe('CHANTIER 8 — INVARIANTS MODE 1', () => {
  it('🔴 aucun vocabulaire commercial n’apparaît, dans AUCUNE des quatre langues', async () => {
    for (const lang of ['en', 'fr', 'es', 'ar']) {
      siteRow = { ...siteRow, lang, mode: 1, products: [] };
      const t = await corps();
      for (const interdit of ['panier', 'Ajouter au panier', 'checkout', '/produits/', 'Add to cart', 'Carrito', 'سلة']) {
        expect(t, `${lang} / ${interdit}`).not.toContain(interdit);
      }
    }
  });

  it('la mention de plateforme est traduite mais nomme toujours Deribfy', async () => {
    for (const lang of ['en', 'fr', 'es', 'ar']) {
      siteRow = { ...siteRow, lang };
      expect(await corps(), lang).toContain('Deribfy');
    }
  });
});

// ============================================================
// DEBT-035 (MODE 1) — LA GAMME DE PRIX ETAIT PUBLIEE D'UN SEUL COTE.
//
// Le chantier 5 a rendu `area_served` ET `price_range` editables ENSEMBLE.
// `JsonLd.tsx` emet les deux (`areaServed`, `priceRange`) ; ce fichier ne
// publiait que le premier. Deux surfaces GEO, deux descriptions differentes
// du meme site.
// ============================================================
describe('DEBT-035 — `price_range` est publie, comme `area_served`', () => {
  it('🔴 la gamme de prix apparaît, sous son intitulé traduit', async () => {
    for (const [lang, intitule] of [
      ['fr', 'Gamme de prix'], ['en', 'Price range'],
      ['es', 'Rango de precios'], ['ar', 'نطاق الأسعار'],
    ] as const) {
      siteRow = { ...siteRow, lang, price_range: '$$' };
      const t = await corps();
      expect(t, `${lang} / intitulé`).toContain('## ' + intitule);
      expect(t, `${lang} / valeur`).toContain('$$');
    }
  });

  it('les deux champs du chantier 5 sont publiés ENSEMBLE', async () => {
    // C'est l'asymétrie même que cette dette corrige : l'un sans l'autre.
    siteRow = { ...siteRow, lang: 'fr', area_served: 'Montréal', price_range: '$$$' };
    const t = await corps();
    expect(t).toContain('## Zone desservie');
    expect(t).toContain('Montréal');
    expect(t).toContain('## Gamme de prix');
    expect(t).toContain('$$$');
  });

  it('un site sans gamme de prix ne produit aucun titre orphelin', async () => {
    siteRow = { ...siteRow, lang: 'fr', price_range: undefined };
    expect(await corps()).not.toContain('Gamme de prix');
  });

  it('🔴 INVARIANT MODE 1 — publier la gamme n’introduit aucun vocabulaire commercial', async () => {
    // La valeur est bornée aux quatre symboles par `isSupportedPriceRange`,
    // qui garde déjà le chemin d'écriture de l'agent : c'est un signal de
    // positionnement, jamais un prix ni un chemin d'achat.
    for (const lang of ['en', 'fr', 'es', 'ar']) {
      siteRow = { ...siteRow, lang, mode: 1, products: [], price_range: '$$$$' };
      const t = await corps();
      for (const interdit of ['panier', 'checkout', '/produits/', 'Add to cart', 'Carrito', 'سلة']) {
        expect(t, `${lang} / ${interdit}`).not.toContain(interdit);
      }
    }
  });
});
