import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toolNamesForSite } from '@/lib/agent-tools/toolCapabilities';

// ============================================================
// FERMETURE MODE 1, VOLET 1 — LA FRONTIERE DE MODE A L'ECRITURE (DEBT-030).
//
// LE DEFAUT MESURE. `ALLOWED_TOOLS` est PLATE : elle dit quels outils
// EXISTENT dans le produit, jamais lesquels sont permis A CE SITE. Recherche
// exhaustive sur les 930 lignes de la route au commit dacac92 :
// `canTransact`, `site.mode`, `toolNamesForSite` et `hasSupplierCatalog` n'y
// apparaissaient QUE dans des commentaires. Un site vitrine obtenait donc 200
// sur `create_promo_code`, `catalog_set_margin` et `catalog_approve_all`.
//
// CE QUE CE FICHIER VERROUILLE, et pourquoi c'est le bon dénominateur : les
// QUATRE ECRIVAINS DIRECTS. Les autres outils commerciaux relaient vers une
// route metier gardee (`hasSupplierCatalog` pour curate/enhance,
// `requireProductOwner` pour set_price/count_product_stock) — leur protection
// etait EMPRUNTEE, et c'est elle qui a masque l'absence totale de protection
// de ceux-ci pendant huit chantiers. Un outil qui appelle `supabaseAdmin`
// sans intermediaire n'a aucun filet en aval : il est le cas a border.
//
// LE CONTROLE POSITIF EST LA MOITIE DE LA PREUVE. Un 403 partout passerait
// aussi ce fichier si la garde etait trop large. Chaque refus est donc
// double d'un succes sur le meme site : la vitrine garde ses onze outils.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const siteLookupMock = vi.fn();
/** Toute ecriture atteignant la base, quelle que soit la table. */
const ecritures: Array<{ table: string; op: 'insert' | 'update'; payload: unknown }> = [];
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const c: Record<string, unknown> = {};
      c.select = () => c; c.eq = () => c; c.ilike = () => c;
      c.insert = (row: unknown) => { ecritures.push({ table, op: 'insert', payload: row }); return { error: null }; };
      c.update = (patch: unknown) => { ecritures.push({ table, op: 'update', payload: patch }); return c; };
      c.single = () => siteLookupMock();
      c.maybeSingle = () => siteLookupMock();
      return c;
    },
  },
}));

let siteRow: Record<string, unknown>;

function req(tool_name: string, tool_input: unknown) {
  return new Request('https://x.test/api/agent/ma-vitrine/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer owner-token' },
    body: JSON.stringify({ tool_name, tool_input }),
  });
}
// Le second parametre attendu par le handler de route, sous sa forme reelle.
type CtxRoute = { params: Promise<{ slug: string }> };
const ctx: CtxRoute = { params: Promise.resolve({ slug: 'ma-vitrine' }) };

async function appeler(outil: string, input: unknown) {
  const { POST } = await import('../route');
  const res = await POST(req(outil, input), ctx);
  return { statut: res.status, corps: await res.json() };
}

/** Une vitrine reelle : Mode 1, un produit jsonb, une section, aucun sous-type. */
function vitrine(over: Record<string, unknown> = {}) {
  return {
    id: 'site-1', slug: 'ma-vitrine', name: 'Cafe du Coin',
    mode: 1, dropship_type: null,
    owner_id: 'owner-id', owner_email: 'owner@test.com',
    products: [{ name: 'Cafe Latte', price: '4.50', description: 'Doux' }],
    sections: [{ name: 'Nos offres', items: [] }],
    gallery: [], faq: [], whyus: [], testimonials: [],
    ...over,
  };
}

beforeEach(() => {
  ecritures.length = 0;
  getUserMock.mockReset().mockResolvedValue({
    data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null,
  });
  siteRow = vitrine();
  siteLookupMock.mockReset().mockImplementation(async () => ({ data: siteRow, error: null }));
});

// ------------------------------------------------------------
describe('DEBT-030 — 🔴 les ecrivains DIRECTS sont refuses a une vitrine', () => {
  // Les quatre outils qui appellent `supabaseAdmin` sans route metier
  // intermediaire : aucun filet en aval, la garde de `/apply` est la seule.
  const DIRECTS: Array<[string, unknown]> = [
    ['create_promo_code', { code: 'ETE20', discount_type: 'percent', discount_value: 20 }],
    ['deactivate_promo_code', { code: 'ETE20' }],
    ['catalog_set_margin', { margin_percent: 45 }],
    ['catalog_approve_all', {}],
  ];

  for (const [outil, input] of DIRECTS) {
    it(`${outil} : 403, et AUCUNE ecriture nulle part`, async () => {
      const { statut } = await appeler(outil, input);
      expect(statut, outil).toBe(403);
      expect(ecritures, `${outil} a ecrit en base`).toEqual([]);
    });
  }

  it('🔴 le refus precede toute ecriture, y compris sur `sites`', async () => {
    // `catalog_set_margin` ecrivait `cj_margin_percent`, colonne ABSENTE de
    // `ALLOWED_FIELDS` : c'etait un contournement de l'allowlist de champs,
    // pas seulement une frontiere de mode franchie.
    await appeler('catalog_set_margin', { margin_percent: 45 });
    expect(ecritures.filter((e) => e.table === 'sites')).toEqual([]);
  });
});

// ------------------------------------------------------------
describe('DEBT-030 — les outils relayes sont refuses au meme titre', () => {
  // Ils etaient deja proteges EN AVAL (hasSupplierCatalog, requireProductOwner).
  // Ils doivent desormais etre refuses EN AMONT : une protection empruntee
  // n'est pas une frontiere, et c'est elle qui avait masque le defaut.
  const RELAYES = ['catalog_curate', 'catalog_enhance', 'set_price', 'set_currency', 'set_for_sale', 'count_product_stock'];

  for (const outil of RELAYES) {
    it(`${outil} : refuse a la porte, sans meme appeler la route metier`, async () => {
      const { statut } = await appeler(outil, { product_name: 'Cafe Latte', price: 1, currency: 'CAD', for_sale: true, units: 1 });
      expect(statut, outil).toBe(403);
      expect(ecritures).toEqual([]);
    });
  }
});

// ------------------------------------------------------------
describe('🔴 CONTROLE POSITIF — la vitrine garde tout ce qui lui revient', () => {
  // Sans ce bloc, une garde trop large passerait les tests ci-dessus.
  const LEGITIMES: Array<[string, unknown]> = [
    ['propose_field_update', { field: 'name', value: 'Cafe du Coin' }],
    ['propose_color_update', { color: '#FA5D1E' }],
    ['propose_theme_change', { theme: 'noir' }],
    ['propose_contact_update', { field: 'phone', value: '+1 514 555 0199' }],
    ['propose_update_social', { platform: 'instagram', url: 'https://instagram.com/x' }],
    ['propose_add_service', { title: 'Petit dejeuner', description: 'D' }],
    ['propose_testimonial_add', { name: 'A', content: 'Super' }],
    ['propose_product_add', { name: 'Croissant', price: '2.00' }],
    ['propose_gallery_add', { image_url: 'https://cdn.test/a.jpg' }],
    ['propose_faq_add', { question: 'Ouvert le dimanche ?', answer: 'Oui.' }],
    ['propose_whyus_add', { title: 'Torrefaction locale', text: 'Chaque semaine.' }],
  ];

  for (const [outil, input] of LEGITIMES) {
    it(`${outil} : toujours 200 pour une vitrine`, async () => {
      const { statut } = await appeler(outil, input);
      expect(statut, outil).toBe(200);
      expect(ecritures.some((e) => e.table === 'sites'), outil).toBe(true);
    });
  }

  it('les outils exerces ci-dessus appartiennent tous au Mode 1', () => {
    const m1 = toolNamesForSite(1, null);
    for (const [outil] of LEGITIMES) expect(m1, outil).toContain(outil);
  });

  it('🔒 CLIQUET DE DENOMINATEUR — le compte des outils Mode 1 est epingle', () => {
    // Le controle positif ci-dessus exerce UN representant par famille, pas
    // les 23 outils. Ce cliquet ferme l'ecart : si une famille s'ouvrait au
    // Mode 1 (ou s'en retirait), le compte bouge et force une revue ICI --
    // sans quoi une nouvelle famille entrerait sans qu'aucun controle positif
    // ne l'exerce jamais. C'est le denominateur, verifie et non suppose.
    expect(toolNamesForSite(1, null)).toHaveLength(23);
    // Et les cinq familles reellement ouvertes au Mode 1 sont bien celles-la.
    for (const attendu of ['propose_field_update', 'propose_add_service', 'propose_testimonial_add',
                           'propose_gallery_add', 'propose_faq_add', 'propose_whyus_add',
                           'propose_product_add']) {
      expect(toolNamesForSite(1, null), attendu).toContain(attendu);
    }
  });
});

// ------------------------------------------------------------
describe('🔴 SYMETRIE — la garde n’est pas une regle « Mode 1 »', () => {
  it('un Mode 2 est refuse sur `propose_product_add`, reserve au Mode 1', async () => {
    // MANUAL_PRODUCT_MODES = {1} : le Mode 2 les a PERDUS a l'etape 0 du
    // catalogue canonique, parce que sa vitrine lit `shop_products`. La garde
    // applique cette frontiere-la aussi, dans l'autre sens.
    siteRow = vitrine({ mode: 2 });
    const { statut } = await appeler('propose_product_add', { name: 'X', price: '1' });
    expect(statut).toBe(403);
    expect(ecritures).toEqual([]);
  });

  it('un Mode 3 `pod_brand` est refuse sur les outils de catalogue', async () => {
    // CATALOG_SUBTYPES exclut `pod_brand` : ses produits viennent des designs
    // du marchand, pas d'un catalogue. Le sous-type est imbrique dans le mode.
    siteRow = vitrine({ mode: 3, dropship_type: 'pod_brand' });
    const { statut } = await appeler('catalog_set_margin', { margin_percent: 45 });
    expect(statut).toBe(403);
    expect(ecritures).toEqual([]);
  });

  it('un Mode 3 `reseller` conserve ses outils de catalogue', async () => {
    siteRow = vitrine({ mode: 3, dropship_type: 'reseller' });
    const { statut } = await appeler('catalog_set_margin', { margin_percent: 45 });
    expect(statut).toBe(200);
    expect(ecritures.some((e) => e.table === 'sites')).toBe(true);
  });

  it('🔴 un mode inconnu, null ou textuel ne recoit QUE les outils universels', async () => {
    for (const mode of [undefined, null, 0, 4, '1', NaN]) {
      for (const [outil, input] of [
        ['propose_field_update', { field: 'name', value: 'X' }],  // universel -> 200
        ['propose_add_service', { title: 'T', description: 'D' }], // content  -> 403
      ] as const) {
        ecritures.length = 0;
        siteRow = vitrine({ mode });
        const { statut } = await appeler(outil, input);
        const attendu = outil === 'propose_field_update' ? 200 : 403;
        expect(statut, `mode=${String(mode)} / ${outil}`).toBe(attendu);
      }
    }
  });
});

// ------------------------------------------------------------
describe('🔒 CLIQUET — l’autorite reste UNIQUE', () => {
  it('la route ne redefinit aucune regle de mode : elle interroge toolCapabilities', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const src = readFileSync(join(__dirname, '../route.ts'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');
    // Une seconde definition ici rejouerait la divergence que l'etape 3 a
    // defaite en extrayant `toolCapabilities`.
    expect(src).toContain('toolNamesForSite(site.mode, site.dropship_type)');
    expect(src, 'aucune comparaison de mode ne doit apparaitre dans la route')
      .not.toMatch(/\bmode\b\s*\)?\s*(?:[=!]==?|[<>]=?)\s*-?\d/);
  });

  it('un outil hors ALLOWED_TOOLS reste un 400, jamais un 403', async () => {
    // Les deux controles gardent des sens distincts : 400 = inconnu du
    // produit, 403 = connu mais interdit a ce site.
    const { statut } = await appeler('drop_database', {});
    expect(statut).toBe(400);
  });
});
