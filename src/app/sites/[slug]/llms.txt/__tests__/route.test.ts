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
  it('le nom, le slogan et l’à-propos restent publiés', async () => {
    const t = await corps();
    expect(t).toContain('# YIA Global Commodities');
    expect(t).toContain('Premium Chadian Commodities');
    expect(t).toContain('## À propos');
  });

  it('INVARIANT MODE 1 — aucun vocabulaire commercial n’apparaît', async () => {
    const t = await corps();
    for (const interdit of ['panier', 'Ajouter au panier', 'checkout', '/produits/']) {
      expect(t, interdit).not.toContain(interdit);
    }
  });
});
