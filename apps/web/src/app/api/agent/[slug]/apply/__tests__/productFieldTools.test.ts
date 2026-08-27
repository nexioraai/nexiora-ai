import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// ÉTAPE 8, VOLET D — set_price / set_currency / set_for_sale.
//
// Même patron que `count_product_stock` (étape 7), même garanties, et c'est
// délibéré : ces trois outils ne réinventent rien. Ce qui est verrouillé ici :
//   1. le modèle ne fournit jamais d'identifiant — seulement un nom ;
//   2. toute ambiguïté sur ce nom bloque l'écriture ;
//   3. l'écriture passe par la MÊME route métier que l'UI, donc par
//      requireProductOwner (propriété + canTransact) ;
//   4. aucun autre champ que celui de l'outil n'est jamais écrit ;
//   5. les produits de catalogue fournisseur sont hors d'atteinte.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const siteLookupMock = vi.fn();
const adminUpdateSpy = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const c: any = {};
      c.select = () => c; c.eq = () => c; c.ilike = () => c; c.insert = () => c;
      c.update = (patch: unknown) => { adminUpdateSpy(table, patch); return c; };
      c.single = () => siteLookupMock();
      c.maybeSingle = () => siteLookupMock();
      return c;
    },
  },
}));

const PRODUIT_ID = '33333333-3333-4333-8333-333333333333';

function req(tool_name: string, tool_input: unknown) {
  return new Request('https://x.test/api/agent/my-shop/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer owner-token' },
    body: JSON.stringify({ tool_name, tool_input }),
  });
}
const ctx = { params: Promise.resolve({ slug: 'my-shop' }) };

let fetchMock: ReturnType<typeof vi.fn>;
let products: unknown[];
let patchResponse: { status: number; body: unknown };

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({
    data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null,
  });
  siteLookupMock.mockReset().mockResolvedValue({
    data: { id: 'my-site-id', slug: 'my-shop', mode: 2, owner_email: 'owner@test.com' }, error: null,
  });
  adminUpdateSpy.mockReset();
  products = [
    { id: PRODUIT_ID, site_id: 'my-site-id', name: 'Mug Noir', price: 10, currency: 'CAD', published: true, for_sale: true },
    { id: 'autre', site_id: 'my-site-id', name: 'Casquette', price: 20, currency: 'CAD', published: true, for_sale: true },
  ];
  patchResponse = { status: 200, body: { product: { id: PRODUIT_ID } } };

  fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/api/shop/products?')) {
      return { ok: true, status: 200, json: async () => ({ products }) } as any;
    }
    if (/\/api\/shop\/products\/[^/?]+$/.test(u)) {
      return { ok: patchResponse.status < 400, status: patchResponse.status, json: async () => patchResponse.body } as any;
    }
    throw new Error('URL inattendue appelee par /apply : ' + u);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

const patchCalls = () => fetchMock.mock.calls.filter((c) => /\/api\/shop\/products\/[^/?]+$/.test(String(c[0])));
const corpsPatch = () => JSON.parse((patchCalls()[0][1] as RequestInit).body as string);

// ------------------------------------------------------------
describe('set_price', () => {
  it('nom résolu -> PATCH sur la route métier, avec le seul champ price', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('set_price', { product_name: 'Mug Noir', price: 25, reason: 'r' }), ctx);
    expect(res.status).toBe(200);
    expect(patchCalls()).toHaveLength(1);
    expect(String(patchCalls()[0][0])).toContain(`/api/shop/products/${PRODUIT_ID}`);
    expect((patchCalls()[0][1] as RequestInit).method).toBe('PATCH');
    expect(corpsPatch()).toEqual({ price: 25 });
  });

  it('price = 0 est valide (un produit gratuit existe)', async () => {
    const { POST } = await import('../route');
    expect((await POST(req('set_price', { product_name: 'Mug Noir', price: 0, reason: 'r' }), ctx)).status).toBe(200);
    expect(corpsPatch()).toEqual({ price: 0 });
  });

  const mauvais: Array<[string, unknown]> = [
    ['absent', undefined], ['null', null], ['négatif', -5], ['chaîne', '25'],
    ['booléen', true], ['tableau', [25]],
  ];
  for (const [label, price] of mauvais) {
    it(`price ${label} -> 400, aucune lecture, aucune écriture`, async () => {
      const { POST } = await import('../route');
      const res = await POST(req('set_price', { product_name: 'Mug Noir', price, reason: 'r' }), ctx);
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});

// ------------------------------------------------------------
describe('set_currency', () => {
  it('code à 3 lettres -> PATCH avec la seule devise, EN MAJUSCULES', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('set_currency', { product_name: 'Mug Noir', currency: 'eur', reason: 'r' }), ctx);
    expect(res.status).toBe(200);
    // Le checkout compare les devises du panier en égalité STRICTE de chaîne :
    // écrire 'eur' à côté d'un 'EUR' posé par l'interface rendrait le panier
    // invendable (409 « Panier incohérent ») sans qu'aucun champ paraisse faux.
    expect(corpsPatch()).toEqual({ currency: 'EUR' });
  });

  it('espaces de bord tolérés, normalisation identique', async () => {
    const { POST } = await import('../route');
    await POST(req('set_currency', { product_name: 'Mug Noir', currency: '  usd  ', reason: 'r' }), ctx);
    expect(corpsPatch()).toEqual({ currency: 'USD' });
  });

  const mauvais: Array<[string, unknown]> = [
    ['absent', undefined], ['null', null], ['2 lettres', 'EU'], ['4 lettres', 'EURO'],
    ['avec chiffre', 'EU1'], ['symbole', '€'], ['vide', ''], ['nombre', 978],
  ];
  for (const [label, currency] of mauvais) {
    it(`currency ${label} -> 400, aucune lecture, aucune écriture`, async () => {
      const { POST } = await import('../route');
      const res = await POST(req('set_currency', { product_name: 'Mug Noir', currency, reason: 'r' }), ctx);
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("aucune liste blanche de devises n'est inventée : un code exotique valide passe", async () => {
    // Ce dépôt n'a AUCUNE allowlist de devises. En créer une ici déciderait à
    // la place du produit quelles monnaies existent.
    const { POST } = await import('../route');
    expect((await POST(req('set_currency', { product_name: 'Mug Noir', currency: 'xof', reason: 'r' }), ctx)).status).toBe(200);
    expect(corpsPatch()).toEqual({ currency: 'XOF' });
  });
});

// ------------------------------------------------------------
describe('set_for_sale', () => {
  it('false -> PATCH { for_sale: false }, et RIEN d\'autre', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('set_for_sale', { product_name: 'Mug Noir', for_sale: false, reason: 'r' }), ctx);
    expect(res.status).toBe(200);
    expect(corpsPatch()).toEqual({ for_sale: false });
    // Surtout PAS `published` : retirer de la vente ne doit jamais faire
    // disparaître le produit. C'est toute la raison d'être du volet A.
    expect(corpsPatch()).not.toHaveProperty('published');
  });

  it('true -> PATCH { for_sale: true }', async () => {
    const { POST } = await import('../route');
    await POST(req('set_for_sale', { product_name: 'Mug Noir', for_sale: true, reason: 'r' }), ctx);
    expect(corpsPatch()).toEqual({ for_sale: true });
  });

  it('le message rendu au modèle dit que le produit RESTE VISIBLE', async () => {
    const { POST } = await import('../route');
    const res = await POST(req('set_for_sale', { product_name: 'Mug Noir', for_sale: false, reason: 'r' }), ctx);
    const json = await res.json();
    expect(json.message.toUpperCase()).toContain('VISIBLE');
  });

  const mauvais: Array<[string, unknown]> = [
    ['absent', undefined], ['null', null], ['chaîne "false"', 'false'],
    ['0', 0], ['1', 1],
  ];
  for (const [label, for_sale] of mauvais) {
    it(`for_sale ${label} -> 400, aucune lecture, aucune écriture`, async () => {
      const { POST } = await import('../route');
      const res = await POST(req('set_for_sale', { product_name: 'Mug Noir', for_sale, reason: 'r' }), ctx);
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});

// ------------------------------------------------------------
describe('résolution par nom — commune aux trois outils', () => {
  const CAS: Array<[string, unknown]> = [
    ['set_price', { price: 25 }],
    ['set_currency', { currency: 'EUR' }],
    ['set_for_sale', { for_sale: false }],
  ];

  for (const [outil, champ] of CAS) {
    it(`${outil} : nom inconnu -> 404, AUCUN patch`, async () => {
      const { POST } = await import('../route');
      const res = await POST(req(outil, { product_name: 'Chapeau', ...(champ as object), reason: 'r' }), ctx);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toContain('Chapeau');
      expect(patchCalls()).toHaveLength(0);
    });

    it(`${outil} : homonymes -> 409, AUCUN patch`, async () => {
      products = [
        { id: 'a', site_id: 'my-site-id', name: 'Mug' },
        { id: 'b', site_id: 'my-site-id', name: 'Mug' },
      ];
      const { POST } = await import('../route');
      const res = await POST(req(outil, { product_name: 'Mug', ...(champ as object), reason: 'r' }), ctx);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain('2 produits');
      expect(patchCalls()).toHaveLength(0);
    });

    it(`${outil} : la casse n'empêche pas la résolution`, async () => {
      const { POST } = await import('../route');
      expect((await POST(req(outil, { product_name: 'mug noir', ...(champ as object), reason: 'r' }), ctx)).status).toBe(200);
    });

    it(`${outil} : un nom approchant ne suffit pas ("Mug" n'atteint pas "Mug Noir")`, async () => {
      const { POST } = await import('../route');
      expect((await POST(req(outil, { product_name: 'Mug', ...(champ as object), reason: 'r' }), ctx)).status).toBe(404);
      expect(patchCalls()).toHaveLength(0);
    });

    it(`${outil} : un product_id glissé dans tool_input est ignoré`, async () => {
      const { POST } = await import('../route');
      await POST(req(outil, { product_name: 'Mug Noir', product_id: 'id-hallucine', ...(champ as object), reason: 'r' }), ctx);
      expect(String(patchCalls()[0][0])).toContain(PRODUIT_ID);
      expect(String(patchCalls()[0][0])).not.toContain('id-hallucine');
    });
  }
});

// ------------------------------------------------------------
describe('sécurité — commune aux trois outils', () => {
  it('le slug vient de l\'URL, jamais du tool_input', async () => {
    const { POST } = await import('../route');
    await POST(req('set_price', { product_name: 'Mug Noir', price: 25, slug: 'boutique-victime', reason: 'r' }), ctx);
    const listCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/shop/products?'));
    expect(String(listCall![0])).toContain('slug=my-shop');
    expect(String(listCall![0])).not.toContain('victime');
  });

  it('le jeton du marchand est relayé à la lecture ET à l\'écriture', async () => {
    const { POST } = await import('../route');
    await POST(req('set_price', { product_name: 'Mug Noir', price: 25, reason: 'r' }), ctx);
    for (const call of fetchMock.mock.calls) {
      const headers = (call[1] as RequestInit | undefined)?.headers as Record<string, string>;
      expect(headers?.Authorization).toBe('Bearer owner-token');
    }
  });

  it('aucune écriture directe dans shop_products via le client admin', async () => {
    const { POST } = await import('../route');
    await POST(req('set_for_sale', { product_name: 'Mug Noir', for_sale: false, reason: 'r' }), ctx);
    expect(adminUpdateSpy).not.toHaveBeenCalled();
  });

  it('appelant non authentifié -> 401, aucune lecture', async () => {
    const { POST } = await import('../route');
    const anon = new Request('https://x.test/api/agent/my-shop/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_name: 'set_price', tool_input: { product_name: 'Mug Noir', price: 25 } }),
    });
    expect((await POST(anon, ctx)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('slug n\'appartenant pas à l\'appelant -> 404, aucune lecture', async () => {
    siteLookupMock.mockResolvedValue({ data: null, error: null });
    const { POST } = await import('../route');
    expect((await POST(req('set_price', { product_name: 'Mug Noir', price: 25, reason: 'r' }), ctx)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lecture des produits refusée -> refus relayé, aucun patch', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/shop/products?')) {
        return { ok: false, status: 403, json: async () => ({ error: 'Acces refuse.' }) } as any;
      }
      throw new Error('ne doit pas etre appele');
    });
    const { POST } = await import('../route');
    expect((await POST(req('set_price', { product_name: 'Mug Noir', price: 25, reason: 'r' }), ctx)).status).toBe(403);
  });

  it('le refus de la route métier (403 Mode 1) est relayé tel quel', async () => {
    patchResponse = { status: 403, body: { error: 'Ce site est une vitrine : il ne peut pas exercer d’activité commerciale.' } };
    const { POST } = await import('../route');
    const res = await POST(req('set_price', { product_name: 'Mug Noir', price: 25, reason: 'r' }), ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain('vitrine');
  });

  it('un 404 de la route métier (produit supprimé entre-temps) est relayé', async () => {
    patchResponse = { status: 404, body: { error: 'Product not found' } };
    const { POST } = await import('../route');
    expect((await POST(req('set_price', { product_name: 'Mug Noir', price: 25, reason: 'r' }), ctx)).status).toBe(404);
  });
});

// ------------------------------------------------------------
describe('les catalogues fournisseur sont hors d\'atteinte', () => {
  it('un produit de catalogue (id `catalog-…`) n\'est jamais visé, car absent de la liste lue', async () => {
    // `GET /api/shop/products` lit `shop_products` SEULE. Les sélections de
    // catalogue (`catalog-{uuid}`) et les mockups pod_brand
    // (`catalog-{cpid}::{variant}`) n'y figurent pas : ces outils ne peuvent
    // structurellement pas les atteindre, et une demande les visant obtient un
    // 404 explicite plutôt qu'une écriture sur un autre produit.
    products = [{ id: PRODUIT_ID, site_id: 'my-site-id', name: 'Mug Noir' }];
    const { POST } = await import('../route');
    const res = await POST(req('set_price', { product_name: 'Tasse Fournisseur', price: 25, reason: 'r' }), ctx);
    expect(res.status).toBe(404);
    expect(patchCalls()).toHaveLength(0);
  });

  it('Mode 3 : les outils restent disponibles et ciblent bien shop_products', async () => {
    siteLookupMock.mockResolvedValue({
      data: { id: 'my-site-id', slug: 'my-shop', mode: 3, dropship_type: 'reseller', owner_email: 'owner@test.com' }, error: null,
    });
    const { POST } = await import('../route');
    expect((await POST(req('set_price', { product_name: 'Mug Noir', price: 25, reason: 'r' }), ctx)).status).toBe(200);
    expect(String(patchCalls()[0][0])).toContain(`/api/shop/products/${PRODUIT_ID}`);
  });
});

// ------------------------------------------------------------
describe('aucun champ collatéral', () => {
  it('chaque outil écrit UN SEUL champ, jamais les autres', async () => {
    const { POST } = await import('../route');
    const attendus: Array<[string, unknown, string]> = [
      ['set_price', { price: 25 }, 'price'],
      ['set_currency', { currency: 'EUR' }, 'currency'],
      ['set_for_sale', { for_sale: false }, 'for_sale'],
    ];
    for (const [outil, champ, cle] of attendus) {
      fetchMock.mockClear();
      await POST(req(outil, { product_name: 'Mug Noir', ...(champ as object), reason: 'r' }), ctx);
      const corps = JSON.parse((patchCalls()[0][1] as RequestInit).body as string);
      expect(Object.keys(corps), outil).toEqual([cle]);
    }
  });

  it('les champs de la politique d\'inventaire ne transitent JAMAIS par ces outils', async () => {
    const { POST } = await import('../route');
    await POST(req('set_price', {
      product_name: 'Mug Noir', price: 25,
      track_inventory: true, stock_counted_at: '2099-01-01T00:00:00Z', stock: 999,
      published: false, reason: 'r',
    }), ctx);
    expect(corpsPatch()).toEqual({ price: 25 });
  });
});
