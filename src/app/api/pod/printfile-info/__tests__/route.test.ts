import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creerFrom, journalVierge, type JournalPostgrest, type TableStub } from '@/lib/testing/postgrest';

// ============================================================
// LOT 6 / P5-05 -- MEME PREUVE QUE LA ROUTE JUMELLE : LE TOKEN PRINTFUL
// N'EST PAS DEPENSE QUAND L'ADMISSION REFUSE.
//
// `fetch` global est un espion. Chaque refus doit le laisser a zero appel --
// et aucun appel ne doit jamais partir vers api.printful.com sans que notre
// propre catalogue ait d'abord resolu le produit parent.
//
// LE CACHE EST MODULE-SCOPE : chaque cas utilise un `variant_id` distinct,
// sans quoi un test contaminerait le suivant en servant une reponse deja
// memorisee -- exactement le genre de harnais qui prouve autre chose que ce
// qu'il annonce.
// ============================================================

let tables: Record<string, TableStub>;
let journal: JournalPostgrest;
const fetchMock = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => creerFrom(tables, journal)(t) },
}));
const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

import { GET } from '../route';

const SITE_POD = { id: 'site-1', mode: 3, dropship_type: 'pod_custom', archived_at: null };

const TEMPLATE = {
  templates: [{ template_id: 1, image_url: 'https://cdn/t.png', template_width: 100, template_height: 100, print_area_left: 10, print_area_top: 10, print_area_width: 50, print_area_height: 50 }],
  variant_mapping: [{ variant_id: 'v-nominal', templates: [{ template_id: 1, placement: 'front' }] }],
};

let n = 0;
const unique = () => `v-${++n}`;

function req(p: Record<string, string>) {
  const u = new URL('https://woorri.test/api/pod/printfile-info');
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  return new Request(u);
}

beforeEach(() => {
  journal = journalVierge();
  tables = {
    sites: { reponse: { data: SITE_POD, error: null } },
    catalog_products: { reponse: { data: { supplier_parent_id: 'parent-1' }, error: null } },
    checkout_anomalies: { reponse: { count: 0, error: null } as never },
  };
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ result: TEMPLATE }) });
  vi.stubGlobal('fetch', fetchMock);
  logAnomalyMock.mockReset().mockResolvedValue(undefined);
  process.env.PRINTFUL_API_TOKEN = 'SECRET-PF';
});

describe('GET /api/pod/printfile-info — admission valide', () => {
  it('un visiteur légitime obtient les placements', async () => {
    const res = await GET(req({ slug: 'ma-boutique', variant_id: unique() }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.placements.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/mockup-generator/templates/parent-1');
  });

  it('le site est résolu par SON slug, non archivé, avec `mode` et `dropship_type` PROJETÉS', async () => {
    await GET(req({ slug: 'ma-boutique', variant_id: unique() }));
    expect(journal.filtres.sites).toContainEqual(['eq', 'slug', 'ma-boutique']);
    expect(journal.filtres.sites).toContainEqual(['is', 'archived_at', null]);
    expect(journal.projections.sites).toContain('mode');
    expect(journal.projections.sites).toContain('dropship_type');
  });
});

describe('GET /api/pod/printfile-info — le contournement total est fermé', () => {
  it('`product_id` fourni dans l’URL est IGNORÉ : le parent vient de notre catalogue', async () => {
    // C'ETAIT LE PROXY LIBRE. `product_id=71` court-circuitait la seule
    // requete qui nous liait a notre catalogue et faisait interroger Printful
    // avec notre token pour n'importe quel produit de LEUR catalogue.
    await GET(req({ slug: 'ma-boutique', variant_id: unique(), product_id: '99999' }));
    expect(String(fetchMock.mock.calls[0][0])).toContain('/templates/parent-1');
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('99999');
  });

  it('variant absent de notre catalogue -> 404, AUCUN appel Printful', async () => {
    tables.catalog_products = { reponse: { data: null, error: null } };
    const res = await GET(req({ slug: 'ma-boutique', variant_id: unique() }));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('le variant est cherché chez `printful` et pour CET identifiant', async () => {
    const v = unique();
    await GET(req({ slug: 'ma-boutique', variant_id: v }));
    expect(journal.filtres.catalog_products).toContainEqual(['eq', 'supplier_id', 'printful']);
    expect(journal.filtres.catalog_products).toContainEqual(['eq', 'supplier_product_id', v]);
  });
});

describe('GET /api/pod/printfile-info — appel direct hors UI', () => {
  it.each([
    ['slug absent', { variant_id: 'x1' }],
    ['variant_id absent', { slug: 'ma-boutique' }],
    ['les deux absents', {}],
  ])('%s -> 400, AUCUN appel Printful', async (_n, p) => {
    const res = await GET(req(p as Record<string, string>));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/pod/printfile-info — admission par les autorités', () => {
  it('slug inexistant -> 404, aucun appel Printful', async () => {
    tables.sites = { reponse: { data: null, error: null } };
    const res = await GET(req({ slug: 'inconnu', variant_id: unique() }));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('panne à la lecture du site -> 503, aucun appel Printful', async () => {
    tables.sites = { reponse: { data: null, error: { message: 'db down' } } };
    const res = await GET(req({ slug: 'ma-boutique', variant_id: unique() }));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([1, 2])('site Mode %s -> 403, aucun appel Printful', async (mode) => {
    tables.sites = { reponse: { data: { ...SITE_POD, mode }, error: null } };
    const res = await GET(req({ slug: 'ma-boutique', variant_id: unique() }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('site pod_brand -> 403 (hors mécanisme de sélections, LOT 2)', async () => {
    tables.sites = { reponse: { data: { ...SITE_POD, dropship_type: 'pod_brand' }, error: null } };
    const res = await GET(req({ slug: 'ma-boutique', variant_id: unique() }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('site RESELLER -> 403 : ses fournisseurs sont CJ, pas Printful', async () => {
    // Cette garde n'est PAS redondante avec la precedente :
    // `usesCatalogSelections` admet `reseller`. Sans la seconde question, un
    // site CJ pouvait faire depenser le token POD de Printful.
    tables.sites = { reponse: { data: { ...SITE_POD, dropship_type: 'reseller' }, error: null } };
    const res = await GET(req({ slug: 'ma-boutique', variant_id: unique() }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/pod/printfile-info — limite de débit', () => {
  it('plafond atteint -> 429, aucun appel Printful', async () => {
    tables.checkout_anomalies = { reponse: { count: 20, error: null } as never };
    const res = await GET(req({ slug: 'ma-boutique', variant_id: unique() }));
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('compteur en PANNE -> 503, aucun appel Printful (jamais fail-open)', async () => {
    tables.checkout_anomalies = { reponse: { count: null, error: { message: 'down' } } as never };
    const res = await GET(req({ slug: 'ma-boutique', variant_id: unique() }));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('le compteur porte sur CE site et CE type', async () => {
    await GET(req({ slug: 'ma-boutique', variant_id: unique() }));
    expect(journal.filtres.checkout_anomalies).toContainEqual(['eq', 'site_id', 'site-1']);
    expect(journal.filtres.checkout_anomalies).toContainEqual(['eq', 'type', 'pod_printfile_request']);
  });
});
