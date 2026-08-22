import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================
// Audit Mode 3 global (N2, meme cause racine que N1 -- checkout/route.ts) --
// POST /api/catalog/selections (ajout manuel d'un produit par le marchand)
// n'importait pas suppliersForDropshipType (source unique deja utilisee par
// catalog/curate et catalog/search) : un marchand reseller pouvait ajouter
// manuellement un produit Printful/Gelato a sa selection, visible ensuite
// dans la recherche "curated" et achetable au checkout en contradiction
// avec l'invariant du sous-mode.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.upsert = vi.fn(self);
  chain.maybeSingle = vi.fn(async () => response);
  chain.single = vi.fn(async () => response);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { POST } from '../route';

function req(body: unknown, token = 'owner-token') {
  return new NextRequest('https://x.test/api/catalog/selections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });
}

function setup(site: { dropship_type: string | null }, product: { supplier_id: string | null } | null) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'sites') return tableChain({ data: { id: 'my-site-id', owner_id: 'owner-id', ...site }, error: null });
    if (table === 'catalog_products') return tableChain({ data: product ? { id: 'cp-1', ...product } : null, error: null });
    if (table === 'site_catalog_selections') return tableChain({ data: { id: 'sel-1', site_id: 'my-site-id', catalog_product_id: 'cp-1' }, error: null });
    return tableChain({ data: null, error: null });
  });
}

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null });
});

describe("POST /api/catalog/selections — N1/N2 : le produit ajouté doit appartenir à un fournisseur éligible pour le sous-mode du site", () => {
  it("site reseller + produit Printful -> 409, jamais ajouté à la sélection", async () => {
    setup({ dropship_type: 'reseller' }, { supplier_id: 'printful' });
    const res = await POST(req({ slug: 'my-shop', catalogProductId: 'cp-1' }));
    expect(res.status).toBe(409);
  });

  it("site pod_brand + produit CJ -> 409", async () => {
    setup({ dropship_type: 'pod_brand' }, { supplier_id: 'cj' });
    const res = await POST(req({ slug: 'my-shop', catalogProductId: 'cp-1' }));
    expect(res.status).toBe(409);
  });

  it("site null dropship_type + produit Printful (fallback reseller/CJ) -> 409", async () => {
    setup({ dropship_type: null }, { supplier_id: 'printful' });
    const res = await POST(req({ slug: 'my-shop', catalogProductId: 'cp-1' }));
    expect(res.status).toBe(409);
  });

  it("site reseller + produit CJ (cas légitime) -> 200, ajouté", async () => {
    setup({ dropship_type: 'reseller' }, { supplier_id: 'cj' });
    const res = await POST(req({ slug: 'my-shop', catalogProductId: 'cp-1' }));
    expect(res.status).toBe(200);
  });

  it("site pod_custom + produit Gelato (cas légitime) -> 200", async () => {
    setup({ dropship_type: 'pod_custom' }, { supplier_id: 'gelato' });
    const res = await POST(req({ slug: 'my-shop', catalogProductId: 'cp-1' }));
    expect(res.status).toBe(200);
  });
});
