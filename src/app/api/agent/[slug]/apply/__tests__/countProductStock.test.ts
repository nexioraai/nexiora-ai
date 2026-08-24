import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// ÉTAPE 7 — LE CHEMIN IA DE LA POLITIQUE D'INVENTAIRE.
//
// Ce qui est verrouillé ici n'est pas « l'outil marche », mais QUATRE
// propriétés dont dépend la sûreté de tout le chantier :
//   1. le modèle ne fournit jamais d'identifiant — seulement un nom ;
//   2. toute ambiguïté sur ce nom bloque l'écriture ;
//   3. le chemin IA passe par la MÊME route métier que l'UI, donc par
//      requireProductOwner (propriété + canTransact) et par la RPC ;
//   4. il n'écrit JAMAIS dans shop_products directement.
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
      c.select = () => c;
      c.eq = () => c;
      c.ilike = () => c;
      c.insert = () => c;
      c.update = (patch: unknown) => { adminUpdateSpy(table, patch); return c; };
      c.single = () => siteLookupMock();
      c.maybeSingle = () => siteLookupMock();
      return c;
    },
  },
}));

const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

function req(tool_input: unknown, tool_name = 'count_product_stock') {
  return new Request('https://x.test/api/agent/my-shop/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer owner-token' },
    body: JSON.stringify({ tool_name, tool_input }),
  });
}
const ctx = { params: Promise.resolve({ slug: 'my-shop' }) };

let fetchMock: ReturnType<typeof vi.fn>;
let products: unknown[];
let inventoryResponse: { status: number; body: unknown };

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({
    data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null,
  });
  siteLookupMock.mockReset().mockResolvedValue({
    data: { id: 'my-site-id', slug: 'my-shop', mode: 2, owner_email: 'owner@test.com' }, error: null,
  });
  adminUpdateSpy.mockReset();
  products = [
    { id: PRODUCT_ID, site_id: 'my-site-id', name: 'Mug Noir', stock: 3, track_inventory: true },
    { id: 'other-prod', site_id: 'my-site-id', name: 'Casquette', stock: 0, track_inventory: false },
  ];
  inventoryResponse = { status: 200, body: { ok: true, product_id: PRODUCT_ID, track_inventory: true, stock: 12 } };

  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/api/shop/products?')) {
      return { ok: true, status: 200, json: async () => ({ products }) } as any;
    }
    if (u.includes('/inventory')) {
      return {
        ok: inventoryResponse.status < 400,
        status: inventoryResponse.status,
        json: async () => inventoryResponse.body,
      } as any;
    }
    throw new Error('URL inattendue appelee par /apply : ' + u);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => { vi.unstubAllGlobals(); });

const inventoryCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/inventory'));

// ------------------------------------------------------------
describe('count_product_stock — résolution par nom', () => {
  it('un nom correspondant à UN seul produit -> appelle la route d\'inventaire avec son id', async () => {
    const { POST } = await import('../route');
    const res = await POST(req({ product_name: 'Mug Noir', units: 12, reason: 'r' }), ctx);
    expect(res.status).toBe(200);
    expect(inventoryCalls()).toHaveLength(1);
    expect(String(inventoryCalls()[0][0])).toContain(`/api/shop/products/${PRODUCT_ID}/inventory`);
    expect(JSON.parse((inventoryCalls()[0][1] as RequestInit).body as string)).toEqual({ units: 12 });
  });

  it('la casse n\'empêche pas la résolution', async () => {
    const { POST } = await import('../route');
    expect((await POST(req({ product_name: 'mug noir', units: 4, reason: 'r' }), ctx)).status).toBe(200);
    expect(inventoryCalls()).toHaveLength(1);
  });

  it('nom inconnu -> 404, AUCUN appel à la route d\'inventaire', async () => {
    const { POST } = await import('../route');
    const res = await POST(req({ product_name: 'Chapeau', units: 12, reason: 'r' }), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain('Chapeau');
    expect(inventoryCalls()).toHaveLength(0);
  });

  it('deux produits homonymes -> 409, AUCUN appel, message de désambiguïsation', async () => {
    products = [
      { id: 'a', site_id: 'my-site-id', name: 'Mug', stock: 1 },
      { id: 'b', site_id: 'my-site-id', name: 'Mug', stock: 2 },
    ];
    const { POST } = await import('../route');
    const res = await POST(req({ product_name: 'Mug', units: 12, reason: 'r' }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('2 produits');
    expect(inventoryCalls()).toHaveLength(0);
  });

  it('un nom approchant ne suffit pas : « Mug » n\'atteint pas « Mug Noir »', async () => {
    const { POST } = await import('../route');
    const res = await POST(req({ product_name: 'Mug', units: 99, reason: 'r' }), ctx);
    expect(res.status).toBe(404);
    expect(inventoryCalls()).toHaveLength(0);
  });
});

// ------------------------------------------------------------
describe('count_product_stock — le modèle ne fournit jamais d\'identifiant', () => {
  it('un product_id glissé dans tool_input est totalement ignoré', async () => {
    const { POST } = await import('../route');
    await POST(req({ product_name: 'Mug Noir', product_id: 'id-invente-par-le-modele', units: 5, reason: 'r' }), ctx);
    // La cible reste celle RÉSOLUE, jamais celle fournie.
    expect(String(inventoryCalls()[0][0])).toContain(PRODUCT_ID);
    expect(String(inventoryCalls()[0][0])).not.toContain('id-invente-par-le-modele');
  });

  it('un id halluciné seul (sans nom valide) n\'écrit rien', async () => {
    const { POST } = await import('../route');
    const res = await POST(req({ product_id: PRODUCT_ID, units: 5, reason: 'r' }), ctx);
    expect(res.status).toBe(404);
    expect(inventoryCalls()).toHaveLength(0);
  });
});

// ------------------------------------------------------------
describe('count_product_stock — le mauvais site ne peut jamais être ciblé', () => {
  it('la lecture est faite sur le slug de l\'URL, jamais sur une valeur du tool_input', async () => {
    const { POST } = await import('../route');
    await POST(req({ product_name: 'Mug Noir', units: 5, slug: 'boutique-de-la-victime', reason: 'r' }), ctx);
    const listCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/shop/products?'));
    expect(String(listCall![0])).toContain('slug=my-shop');
    expect(String(listCall![0])).not.toContain('victime');
  });

  it('le jeton du marchand est relayé à la lecture ET à l\'écriture (jamais un accès privilégié)', async () => {
    const { POST } = await import('../route');
    await POST(req({ product_name: 'Mug Noir', units: 5, reason: 'r' }), ctx);
    for (const call of fetchMock.mock.calls) {
      const headers = (call[1] as RequestInit | undefined)?.headers as Record<string, string>;
      expect(headers?.Authorization).toBe('Bearer owner-token');
    }
  });

  it('si la lecture des produits est refusée, le refus est relayé et rien n\'est écrit', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/shop/products?')) {
        return { ok: false, status: 403, json: async () => ({ error: 'Acces refuse.' }) } as any;
      }
      throw new Error('ne doit pas etre appele');
    });
    const { POST } = await import('../route');
    const res = await POST(req({ product_name: 'Mug Noir', units: 5, reason: 'r' }), ctx);
    expect(res.status).toBe(403);
    expect(inventoryCalls()).toHaveLength(0);
  });

  it('/apply lui-même refuse un slug qui n\'appartient pas à l\'appelant -> 404, aucune lecture', async () => {
    siteLookupMock.mockResolvedValue({ data: null, error: null });
    const { POST } = await import('../route');
    const res = await POST(req({ product_name: 'Mug Noir', units: 5, reason: 'r' }), ctx);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('appelant non authentifié -> 401, aucune lecture, aucune écriture', async () => {
    const { POST } = await import('../route');
    const anon = new Request('https://x.test/api/agent/my-shop/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_name: 'count_product_stock', tool_input: { product_name: 'Mug Noir', units: 5 } }),
    });
    expect((await POST(anon, ctx)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------
describe('count_product_stock — ne contourne JAMAIS la route métier', () => {
  it('aucune écriture directe dans shop_products via le client admin', async () => {
    const { POST } = await import('../route');
    await POST(req({ product_name: 'Mug Noir', units: 12, reason: 'r' }), ctx);
    const tablesÉcrites = adminUpdateSpy.mock.calls.map((c) => c[0]);
    expect(tablesÉcrites).not.toContain('shop_products');
    expect(adminUpdateSpy).not.toHaveBeenCalled();
  });

  it('le refus de la route métier (403 Mode 1) est relayé tel quel', async () => {
    inventoryResponse = { status: 403, body: { error: 'Ce site est une vitrine : il ne peut pas exercer d’activité commerciale.' } };
    const { POST } = await import('../route');
    const res = await POST(req({ product_name: 'Mug Noir', units: 12, reason: 'r' }), ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain('vitrine');
  });

  it('le refus de la barrière (409) est relayé tel quel, jamais réinterprété', async () => {
    inventoryResponse = { status: 409, body: { error: 'STOCK_TRACKING_REQUIRES_COUNT: ...' } };
    const { POST } = await import('../route');
    const res = await POST(req({ product_name: 'Mug Noir', units: 12, reason: 'r' }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('STOCK_TRACKING_REQUIRES_COUNT');
  });

  it('un 404 de la route métier (produit supprimé entre-temps) est relayé', async () => {
    inventoryResponse = { status: 404, body: { error: 'Product not found' } };
    const { POST } = await import('../route');
    expect((await POST(req({ product_name: 'Mug Noir', units: 1, reason: 'r' }), ctx)).status).toBe(404);
  });
});

// ------------------------------------------------------------
describe('count_product_stock — validation de units (avant toute lecture)', () => {
  const mauvaises: Array<[string, unknown]> = [
    ['absent', undefined], ['null', null], ['négatif', -5],
    ['décimal', 2.5], ['chaîne', '12'], ['booléen', true],
  ];
  for (const [label, units] of mauvaises) {
    it(`units ${label} -> 400, aucune lecture, aucune écriture`, async () => {
      const { POST } = await import('../route');
      const res = await POST(req({ product_name: 'Mug Noir', units, reason: 'r' }), ctx);
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it('units = 0 est valide : « je n\'en ai plus » est un comptage', async () => {
    const { POST } = await import('../route');
    expect((await POST(req({ product_name: 'Mug Noir', units: 0, reason: 'r' }), ctx)).status).toBe(200);
    expect(JSON.parse((inventoryCalls()[0][1] as RequestInit).body as string)).toEqual({ units: 0 });
  });
});

// ------------------------------------------------------------
describe('allowlist des outils — aucune porte ouverte au-delà de count_product_stock', () => {
  it('un outil d\'inventaire non déclaré est refusé', async () => {
    const { POST } = await import('../route');
    const res = await POST(req({ product_name: 'Mug Noir', units: 1 }, 'set_product_stock'), ctx);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("les outils du volet D sont désormais DÉCLARÉS, mais restent validés (cliquet retourné)", async () => {
    // Ils ne sont plus refusés par l'allowlist — c'est le volet D. Ils
    // refusent en revanche une charge utile invalide, AVANT toute lecture :
    // `value` n'est le champ d'aucun des trois.
    const { POST } = await import('../route');
    for (const nom of ['set_price', 'set_currency', 'set_for_sale']) {
      const res = await POST(req({ product_name: 'Mug Noir', value: 1 }, nom), ctx);
      expect(res.status, nom).toBe(400);
      expect(fetchMock, nom).not.toHaveBeenCalled();
    }
  });

  it("un nom d'outil produit NON prévu reste refusé par l'allowlist", async () => {
    const { POST } = await import('../route');
    for (const nom of ['set_stock', 'set_published', 'set_product_field', 'delete_product']) {
      const res = await POST(req({ product_name: 'Mug Noir', value: 1 }, nom), ctx);
      expect(res.status, nom).toBe(400);
      expect(fetchMock, nom).not.toHaveBeenCalled();
    }
  });
});
