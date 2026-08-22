import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Audit Mode 3 global (CRIT-2) -- POST /api/shop/products spreadait tout le
// JSON client (via `...productData`, typé `any`) directement dans
// createProduct(), sans liste blanche. shop_products.cj_vid déclenche une
// VRAIE commande CJ facturée (src/lib/cj/fulfill.ts:325-334) et cost_price
// est la source du garde-fou financier Mode 3 (checkout/route.ts) -- aucun
// des deux n'a de chemin d'écriture légitime ailleurs dans l'application
// (grep exhaustif : aucune UI, aucune route de sync). Ces tests verrouillent
// qu'un marchand ne peut plus les écrire via cette route, même en les
// glissant explicitement dans le body.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const siteLookupMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => siteLookupMock(),
          }),
        }),
      }),
    }),
  },
}));

const createProductMock = vi.fn();
const updateProductMock = vi.fn();
const getProductMock = vi.fn();
const deleteProductMock = vi.fn();
vi.mock('@/lib/shop', () => ({
  createProduct: (...a: unknown[]) => createProductMock(...a),
  updateProduct: (...a: unknown[]) => updateProductMock(...a),
  getProduct: (...a: unknown[]) => getProductMock(...a),
  deleteProduct: (...a: unknown[]) => deleteProductMock(...a),
  getAllProducts: vi.fn(),
}));

function req(body: unknown, token = 'owner-token') {
  return new Request('https://x.test/api/shop/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null });
  siteLookupMock.mockReset().mockResolvedValue({ data: { id: 'my-site-id' }, error: null });
  createProductMock.mockReset().mockResolvedValue({ id: 'p1' });
  updateProductMock.mockReset().mockResolvedValue({ id: 'p1' });
  getProductMock.mockReset().mockResolvedValue({ id: 'p1', site_id: 'my-site-id' });
  deleteProductMock.mockReset();
});

describe('POST /api/shop/products — CRIT-2 : cj_vid/cost_price jamais écrivables via cette route', () => {
  it("un body contenant cj_vid/cost_price en plus des champs légitimes -> createProduct ne les reçoit JAMAIS", async () => {
    const { POST } = await import('../route');
    await POST(req({
      slug: 'my-shop',
      name: 'Mug',
      price: 5,
      cj_vid: 'real-expensive-cj-variant-id',
      cost_price: 1,
    }));
    expect(createProductMock).toHaveBeenCalledTimes(1);
    const sentInput = createProductMock.mock.calls[0][0];
    expect(sentInput).not.toHaveProperty('cj_vid');
    expect(sentInput).not.toHaveProperty('cost_price');
    expect(sentInput).toEqual({ site_id: 'my-site-id', name: 'Mug', price: 5 });
  });

  it("champs légitimes (description, currency, images, stock, published, position) passent normalement", async () => {
    const { POST } = await import('../route');
    await POST(req({
      slug: 'my-shop', name: 'Mug', price: 5, description: 'joli mug', currency: 'usd',
      images: ['x.png'], stock: 10, published: true, position: 1,
    }));
    const sentInput = createProductMock.mock.calls[0][0];
    expect(sentInput).toEqual({
      site_id: 'my-site-id', name: 'Mug', price: 5, description: 'joli mug', currency: 'usd',
      images: ['x.png'], stock: 10, published: true, position: 1,
    });
  });
});

describe('PATCH /api/shop/products/[id] — CRIT-2 : même garde sur la mise à jour', () => {
  function patchReq(body: unknown, token = 'owner-token') {
    return new Request('https://x.test/api/shop/products/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
  }

  it("body contenant cj_vid/cost_price -> updateProduct ne les reçoit jamais", async () => {
    const { PATCH } = await import('../[id]/route');
    await PATCH(patchReq({ price: 3, cj_vid: 'attacker-chosen-variant', cost_price: 0.01 }), { params: Promise.resolve({ id: 'p1' }) });
    expect(updateProductMock).toHaveBeenCalledTimes(1);
    const sentPatch = updateProductMock.mock.calls[0][1];
    expect(sentPatch).not.toHaveProperty('cj_vid');
    expect(sentPatch).not.toHaveProperty('cost_price');
    expect(sentPatch).toEqual({ price: 3 });
  });

  it("slug/site_id/id (déjà exclus avant) restent également exclus", async () => {
    const { PATCH } = await import('../[id]/route');
    await PATCH(patchReq({ price: 3, slug: 'x', site_id: 'other-site', id: 'other-id' }), { params: Promise.resolve({ id: 'p1' }) });
    const sentPatch = updateProductMock.mock.calls[0][1];
    expect(sentPatch).toEqual({ price: 3 });
  });
});
