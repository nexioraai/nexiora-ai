import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creerFrom, journalVierge, type JournalPostgrest, type TableStub } from '@/lib/testing/postgrest';

// ============================================================
// LOT 6 / DEBT-057 -- CE QUE CES TESTS PROUVENT.
//
// Un seul fait, mesure a chaque cas : LE CREDENTIAL FOURNISSEUR N'EST PAS
// DEPENSE. `listVariants` est un espion ; toute admission refusee doit le
// laisser a zero appel. Un test qui se contenterait du code de statut ne
// prouverait rien -- c'est la depense qui est l'enjeu, pas la reponse.
//
// LE HARNAIS HONORE LA PROJECTION ET CAPTURE LES FILTRES (cf. lib/testing/
// postgrest.ts) : retirer `.eq('slug', ...)` ou omettre `mode` de la
// projection devient observable, au lieu de passer inapercu.
//
// La limite de debit n'est PAS mockee : `consommerJeton` s'execute pour de
// vrai contre la table `checkout_anomalies` du double.
// ============================================================

const listVariants = vi.fn();
let tables: Record<string, TableStub>;
let journal: JournalPostgrest;

vi.mock('@/lib/suppliers/registry', () => ({
  suppliersWithCapability: () => [
    { id: 'cj', credentials: { token: 'SECRET-CJ' }, adapter: { listVariants: (...a: unknown[]) => listVariants(...a) } },
    { id: 'printful', credentials: { token: 'SECRET-PF' }, adapter: { listVariants: (...a: unknown[]) => listVariants(...a) } },
  ],
}));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => creerFrom(tables, journal)(t) },
}));
const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

import { GET } from '../route';

const SITE_RESELLER = { id: 'site-1', mode: 3, dropship_type: 'reseller', archived_at: null };

function req(p: Record<string, string>) {
  const u = new URL('https://woorri.test/api/catalog/variants');
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  return new (require('next/server').NextRequest)(u);
}

beforeEach(() => {
  journal = journalVierge();
  tables = {
    sites: { reponse: { data: SITE_RESELLER, error: null } },
    catalog_products: { reponse: { data: { id: 'cp-1', supplier_parent_id: null }, error: null } },
    checkout_anomalies: { reponse: { count: 0, error: null } as never },
  };
  listVariants.mockReset().mockResolvedValue([
    { variant_id: 'v1', name: 'M', price: 10, stock_quantity: 5 },
    { variant_id: 'v2', name: 'L', price: 10, stock_quantity: 0 },
  ]);
  logAnomalyMock.mockReset().mockResolvedValue(undefined);
});

const params = { slug: 'ma-boutique', supplier_id: 'cj', supplier_product_id: 'sp-1' };

describe('GET /api/catalog/variants — admission valide', () => {
  it('un visiteur légitime obtient les variantes EN STOCK', async () => {
    const res = await GET(req(params));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.variants).toHaveLength(1);
    expect(j.variants[0].variant_id).toBe('v1');
    expect(listVariants).toHaveBeenCalledWith('sp-1', { token: 'SECRET-CJ' });
  });

  it('le site est résolu par SON slug et jamais archivé', async () => {
    await GET(req(params));
    expect(journal.filtres.sites).toContainEqual(['eq', 'slug', 'ma-boutique']);
    expect(journal.filtres.sites).toContainEqual(['is', 'archived_at', null]);
  });

  it('la projection demande RÉELLEMENT `mode` et `dropship_type` — sinon les gardes sont aveugles', () => {
    return GET(req(params)).then(() => {
      expect(journal.projections.sites).toContain('mode');
      expect(journal.projections.sites).toContain('dropship_type');
    });
  });
});

describe('GET /api/catalog/variants — appel direct hors UI', () => {
  it.each([
    ['slug absent', { supplier_id: 'cj', supplier_product_id: 'sp-1' }],
    ['supplier_id absent', { slug: 'ma-boutique', supplier_product_id: 'sp-1' }],
    ['supplier_product_id absent', { slug: 'ma-boutique', supplier_id: 'cj' }],
  ])('%s -> 400, AUCUN credential dépensé', async (_n, p) => {
    const res = await GET(req(p as Record<string, string>));
    expect(res.status).toBe(400);
    expect(listVariants).not.toHaveBeenCalled();
  });

  it('fournisseur inconnu -> 400, aucun credential dépensé', async () => {
    const res = await GET(req({ ...params, supplier_id: 'inexistant' }));
    expect(res.status).toBe(400);
    expect(listVariants).not.toHaveBeenCalled();
  });
});

describe('GET /api/catalog/variants — le slug ne suffit pas', () => {
  it('slug inexistant -> 404, aucun credential dépensé', async () => {
    tables.sites = { reponse: { data: null, error: null } };
    const res = await GET(req(params));
    expect(res.status).toBe(404);
    expect(listVariants).not.toHaveBeenCalled();
  });

  it('panne à la lecture du site -> 503, jamais une autorisation', async () => {
    tables.sites = { reponse: { data: null, error: { message: 'db down' } } };
    const res = await GET(req(params));
    expect(res.status).toBe(503);
    expect(listVariants).not.toHaveBeenCalled();
  });

  it.each([1, 2])('site Mode %s -> 403, aucun credential dépensé', async (mode) => {
    tables.sites = { reponse: { data: { ...SITE_RESELLER, mode }, error: null } };
    const res = await GET(req(params));
    expect(res.status).toBe(403);
    expect(listVariants).not.toHaveBeenCalled();
  });

  it('site pod_brand -> 403 : il n’utilise pas le mécanisme de sélections (LOT 2)', async () => {
    tables.sites = { reponse: { data: { ...SITE_RESELLER, dropship_type: 'pod_brand' }, error: null } };
    const res = await GET(req(params));
    expect(res.status).toBe(403);
    expect(listVariants).not.toHaveBeenCalled();
  });

  it('sous-type absent -> 403 (le repli du LOT 1 ne donne aucun fournisseur)', async () => {
    tables.sites = { reponse: { data: { ...SITE_RESELLER, dropship_type: null }, error: null } };
    const res = await GET(req(params));
    expect(res.status).toBe(403);
    expect(listVariants).not.toHaveBeenCalled();
  });
});

describe('GET /api/catalog/variants — fournisseur hors sous-mode', () => {
  it('un site reseller ne fait PAS appeler Printful -> 403', async () => {
    const res = await GET(req({ ...params, supplier_id: 'printful' }));
    expect(res.status).toBe(403);
    expect(listVariants).not.toHaveBeenCalled();
  });

  it('un site pod_custom ne fait PAS appeler CJ -> 403', async () => {
    tables.sites = { reponse: { data: { ...SITE_RESELLER, dropship_type: 'pod_custom' }, error: null } };
    const res = await GET(req({ ...params, supplier_id: 'cj' }));
    expect(res.status).toBe(403);
    expect(listVariants).not.toHaveBeenCalled();
  });

  it('un site pod_custom PEUT faire appeler Printful -> 200', async () => {
    tables.sites = { reponse: { data: { ...SITE_RESELLER, dropship_type: 'pod_custom' }, error: null } };
    const res = await GET(req({ ...params, supplier_id: 'printful' }));
    expect(res.status).toBe(200);
    expect(listVariants).toHaveBeenCalledWith('sp-1', { token: 'SECRET-PF' });
  });
});

describe('GET /api/catalog/variants — GARDE ANTI-PROXY', () => {
  it('produit absent de NOTRE catalogue -> 404, aucun credential dépensé', async () => {
    tables.catalog_products = { reponse: { data: null, error: null } };
    const res = await GET(req({ ...params, supplier_product_id: 'produit-arbitraire-printful' }));
    expect(res.status).toBe(404);
    expect(listVariants).not.toHaveBeenCalled();
  });

  it('le produit est cherché pour CE fournisseur et CET identifiant', async () => {
    await GET(req(params));
    expect(journal.filtres.catalog_products).toContainEqual(['eq', 'supplier_id', 'cj']);
    expect(journal.filtres.catalog_products).toContainEqual(['eq', 'supplier_product_id', 'sp-1']);
  });

  it('panne à la lecture du catalogue -> 503, jamais une autorisation', async () => {
    tables.catalog_products = { reponse: { data: null, error: { message: 'boom' } } };
    const res = await GET(req(params));
    expect(res.status).toBe(503);
    expect(listVariants).not.toHaveBeenCalled();
  });
});

describe('GET /api/catalog/variants — limite de débit', () => {
  it('plafond atteint -> 429, aucun credential dépensé', async () => {
    tables.checkout_anomalies = { reponse: { count: 30, error: null } as never };
    const res = await GET(req(params));
    expect(res.status).toBe(429);
    expect(listVariants).not.toHaveBeenCalled();
  });

  it('compteur en PANNE -> 503, aucun credential dépensé (jamais fail-open)', async () => {
    tables.checkout_anomalies = { reponse: { count: null, error: { message: 'down' } } as never };
    const res = await GET(req(params));
    expect(res.status).toBe(503);
    expect(listVariants).not.toHaveBeenCalled();
  });

  it('le compteur porte sur CE site — sinon un abuseur couperait tout le parc', async () => {
    await GET(req(params));
    expect(journal.filtres.checkout_anomalies).toContainEqual(['eq', 'site_id', 'site-1']);
    expect(journal.filtres.checkout_anomalies).toContainEqual(['eq', 'type', 'catalog_variants_request']);
  });

  it('un appel admis CONSOMME un jeton', async () => {
    await GET(req(params));
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'catalog_variants_request', siteId: 'site-1', severity: 'info' })
    );
  });
});

describe('GET /api/catalog/variants — contrat de réponse préservé', () => {
  it('TOUT refus rend `variants: []` — les trois appelants lisent Array.isArray(d.variants)', async () => {
    const refus = [
      () => { tables.sites = { reponse: { data: null, error: null } }; },
      () => { tables.sites = { reponse: { data: { ...SITE_RESELLER, mode: 1 }, error: null } }; },
      () => { tables.catalog_products = { reponse: { data: null, error: null } }; },
      () => { tables.checkout_anomalies = { reponse: { count: 99, error: null } as never }; },
    ];
    for (const preparer of refus) {
      journal = journalVierge();
      tables = {
        sites: { reponse: { data: SITE_RESELLER, error: null } },
        catalog_products: { reponse: { data: { id: 'cp-1' }, error: null } },
        checkout_anomalies: { reponse: { count: 0, error: null } as never },
      };
      preparer();
      const j = await (await GET(req(params))).json();
      expect(Array.isArray(j.variants), JSON.stringify(j)).toBe(true);
      expect(j.variants).toEqual([]);
    }
  });

  it('une panne du fournisseur reste avalée en `{variants: []}` (comportement d’origine)', async () => {
    listVariants.mockRejectedValue(new Error('supplier down'));
    const res = await GET(req(params));
    expect(res.status).toBe(200);
    expect((await res.json()).variants).toEqual([]);
  });
});
