import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// LOT K (Mode 3 global, fuites d'info) -- première couverture de cette
// route (aucune avant ce lot). Verrouille le correctif central : la réponse
// à un visiteur public ne doit JAMAIS contenir le coût fournisseur réel
// (`_cost`, ni `catalog_products.price` brut) ni aucune colonne non
// explicitement listée -- avant ce lot, `.select('*')` + `{...p}` exposaient
// silencieusement toute colonne future ajoutée à catalog_products, en plus
// du coût déjà identifié.

function tableChain(response: { data: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.not = vi.fn(self);
  chain.ilike = vi.fn(self);
  chain.in = vi.fn(self);
  chain.lte = vi.fn(self);
  chain.order = vi.fn(self);
  chain.range = vi.fn(self);
  chain.single = vi.fn(async () => response);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { GET } from '../route';

const SITE = { id: 'site-1', type: 'fashion store', mode: 2, dropship_type: 'reseller', cj_margin_percent: 30, cj_round_mode: null };

const GLOBAL_PRODUCT = {
  id: 'cp-1',
  supplier_id: 'cj',
  supplier_product_id: 'vid-1',
  name: 'Bracelet',
  description: 'A bracelet',
  category: 'jewelry',
  images: ['https://x.test/a.png'],
  variants: [{ vid: 'v1' }],
  price: 5, // coût fournisseur réel en base
  currency: 'usd',
  shipping_days_min: 3,
  shipping_days_max: 7,
  warehouse_country: 'US',
  in_stock: true,
  // Colonne hypothétique non listée dans le select explicite -- si le code
  // repassait à `{...p}`, elle réapparaîtrait dans la réponse.
  internal_sync_notes: 'ne doit jamais quitter le serveur',
};

function setupTables(overrides: Record<string, { data: unknown; error?: unknown; count?: number | null }> = {}) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'sites') return tableChain(overrides.sites ?? { data: SITE, error: null });
    if (table === 'site_catalog_selections') return tableChain(overrides.site_catalog_selections ?? { data: [], error: null });
    if (table === 'catalog_products') return tableChain(overrides.catalog_products ?? { data: [GLOBAL_PRODUCT], error: null, count: 1 });
    throw new Error('unexpected table: ' + table);
  });
}

function req(params: Record<string, string>) {
  const url = new URL('https://woorri.test/api/catalog/search');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

beforeEach(() => {
  fromMock.mockReset();
});

describe('GET /api/catalog/search — LOT K : aucune fuite du coût fournisseur', () => {
  it("un produit du catalogue global n'expose jamais le coût brut (_cost) ni la colonne interne non listée", async () => {
    setupTables();
    const res = await GET(req({ slug: 'boutique', q: 'bracelet' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    const product = json.products.find((p: any) => p.id === 'catalog-cp-1');
    expect(product).toBeDefined();
    expect(product._cost).toBeUndefined();
    expect(product.internal_sync_notes).toBeUndefined();
    expect(product.in_stock).toBeUndefined();
  });

  it("le prix renvoyé est bien le prix MARQUÉ (avec marge), jamais le coût brut de la ligne DB", async () => {
    setupTables();
    const res = await GET(req({ slug: 'boutique', q: 'bracelet' }));
    const json = await res.json();
    const product = json.products.find((p: any) => p.id === 'catalog-cp-1');
    // cost=5, marge 30% -> prix marqué strictement supérieur au coût brut.
    expect(product.price).toBeGreaterThan(5);
  });

  it('le champ `price` transporte uniquement le prix marqué -- jamais le coût brut, même sous un autre nom', async () => {
    setupTables();
    const res = await GET(req({ slug: 'boutique', q: 'bracelet' }));
    const json = await res.json();
    const product = json.products.find((p: any) => p.id === 'catalog-cp-1');
    const values = Object.values(product);
    // Le coût brut (5) ne doit apparaître nulle part dans l'objet exposé.
    expect(values).not.toContain(5);
  });

  it('les champs légitimement attendus par le frontend (CatalogSearch.tsx) restent tous présents -- aucune régression fonctionnelle', async () => {
    setupTables();
    const res = await GET(req({ slug: 'boutique', q: 'bracelet' }));
    const json = await res.json();
    const product = json.products.find((p: any) => p.id === 'catalog-cp-1');
    expect(product).toEqual(expect.objectContaining({
      id: 'catalog-cp-1',
      supplier_id: 'cj',
      supplier_product_id: 'vid-1',
      name: 'Bracelet',
      description: 'A bracelet',
      category: 'jewelry',
      images: ['https://x.test/a.png'],
      variants: [{ vid: 'v1' }],
      currency: 'usd',
      shipping_days_min: 3,
      shipping_days_max: 7,
      warehouse_country: 'US',
    }));
  });
});

describe('GET /api/catalog/search — validation d\'entrée', () => {
  it('slug manquant -> 400', async () => {
    const res = await GET(req({ q: 'bracelet' }));
    expect(res.status).toBe(400);
  });

  it('site introuvable -> 404', async () => {
    setupTables({ sites: { data: null, error: null } });
    const res = await GET(req({ slug: 'inconnu' }));
    expect(res.status).toBe(404);
  });
});
