import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// ÉTAPE 7 du chantier catalogue canonique — LA SEULE PORTE D'ENTRÉE DE LA
// POLITIQUE D'INVENTAIRE.
//
// Les étapes 1 à 6 ont posé la mécanique (colonnes, barrière de recomptage,
// RPC, décrément sélectif, checkStock, exclusion des allowlists) puis fermé
// toute porte générique — ce qui rendait l'ensemble INERTE. Cette route est le
// seul chemin applicatif restant, et ces tests verrouillent ses deux
// propriétés non négociables :
//   1. aucune écriture n'est possible sans propriété ET admission commerciale ;
//   2. la route ne rejoue AUCUNE règle métier — elle transporte et traduit.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const siteLookupMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => {
      const c: any = {};
      c.select = () => c;
      c.eq = () => c;
      c.single = () => siteLookupMock();
      c.maybeSingle = () => siteLookupMock();
      return c;
    },
  },
}));

const getProductMock = vi.fn();
const enableStockTrackingMock = vi.fn();
const disableStockTrackingMock = vi.fn();
vi.mock('@/lib/shop', () => ({
  getProduct: (...a: unknown[]) => getProductMock(...a),
  enableStockTracking: (...a: unknown[]) => enableStockTrackingMock(...a),
  disableStockTracking: (...a: unknown[]) => disableStockTrackingMock(...a),
}));

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

function postReq(body: unknown, token: string | null = 'owner-token') {
  return new Request(`https://x.test/api/shop/products/${PRODUCT_ID}/inventory`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body),
  });
}

function deleteReq(token: string | null = 'owner-token') {
  return new Request(`https://x.test/api/shop/products/${PRODUCT_ID}/inventory`, {
    method: 'DELETE',
    headers: token ? { authorization: 'Bearer ' + token } : {},
  });
}

const ctx = (id = PRODUCT_ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({
    data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null,
  });
  siteLookupMock.mockReset().mockResolvedValue({
    data: { id: 'my-site-id', mode: 2, owner_id: 'owner-id', owner_email: 'owner@test.com' }, error: null,
  });
  getProductMock.mockReset().mockResolvedValue({ id: PRODUCT_ID, site_id: 'my-site-id', name: 'Mug' });
  enableStockTrackingMock.mockReset().mockResolvedValue({
    ok: true, stock: 12, stock_counted_at: '2026-08-24T10:00:00.123456Z',
  });
  disableStockTrackingMock.mockReset().mockResolvedValue({ id: PRODUCT_ID, track_inventory: false });
});

// ------------------------------------------------------------
describe('POST inventory — admission : propriété et mode', () => {
  it('propriétaire Mode 2 -> succès', async () => {
    const { POST } = await import('../route');
    const res = await POST(postReq({ units: 12 }), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      ok: true, product_id: PRODUCT_ID, track_inventory: true,
      stock: 12, stock_counted_at: '2026-08-24T10:00:00.123456Z',
    });
  });

  it('propriétaire Mode 3 -> succès (le dropshipping VEND, il commerce)', async () => {
    siteLookupMock.mockResolvedValue({
      data: { id: 'my-site-id', mode: 3, owner_id: 'owner-id', owner_email: 'owner@test.com' }, error: null,
    });
    const { POST } = await import('../route');
    expect((await POST(postReq({ units: 3 }), ctx())).status).toBe(200);
  });

  it('site Mode 1 (vitrine) -> 403, et enable_stock_tracking N\'EST JAMAIS APPELÉE', async () => {
    siteLookupMock.mockResolvedValue({
      data: { id: 'my-site-id', mode: 1, owner_id: 'owner-id', owner_email: 'owner@test.com' }, error: null,
    });
    const { POST } = await import('../route');
    const res = await POST(postReq({ units: 12 }), ctx());
    expect(res.status).toBe(403);
    expect(enableStockTrackingMock).not.toHaveBeenCalled();
  });

  it('mode inconnu (4) -> 403 : allowlist, pas dénylist', async () => {
    siteLookupMock.mockResolvedValue({
      data: { id: 'my-site-id', mode: 4, owner_id: 'owner-id', owner_email: 'owner@test.com' }, error: null,
    });
    const { POST } = await import('../route');
    expect((await POST(postReq({ units: 1 }), ctx())).status).toBe(403);
  });

  it('mode NULL -> 403 (fail-closed)', async () => {
    siteLookupMock.mockResolvedValue({
      data: { id: 'my-site-id', mode: null, owner_id: 'owner-id', owner_email: 'owner@test.com' }, error: null,
    });
    const { POST } = await import('../route');
    expect((await POST(postReq({ units: 1 }), ctx())).status).toBe(403);
  });

  it('non authentifié (aucun jeton) -> 401, aucune écriture', async () => {
    const { POST } = await import('../route');
    const res = await POST(postReq({ units: 12 }, null), ctx());
    expect(res.status).toBe(401);
    expect(enableStockTrackingMock).not.toHaveBeenCalled();
  });

  it('jeton invalide -> 401', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });
    const { POST } = await import('../route');
    expect((await POST(postReq({ units: 12 }), ctx())).status).toBe(401);
  });

  it('produit d\'un AUTRE propriétaire -> 403, aucune écriture', async () => {
    siteLookupMock.mockResolvedValue({
      data: { id: 'other-site', mode: 2, owner_id: 'someone-else', owner_email: 'other@test.com' }, error: null,
    });
    const { POST } = await import('../route');
    const res = await POST(postReq({ units: 999 }), ctx());
    expect(res.status).toBe(403);
    expect(enableStockTrackingMock).not.toHaveBeenCalled();
  });

  it('produit inexistant -> 404, aucune écriture', async () => {
    getProductMock.mockResolvedValue(null);
    const { POST } = await import('../route');
    const res = await POST(postReq({ units: 12 }), ctx());
    expect(res.status).toBe(404);
    expect(enableStockTrackingMock).not.toHaveBeenCalled();
  });

  it('site du produit introuvable -> 404, aucune écriture', async () => {
    siteLookupMock.mockResolvedValue({ data: null, error: null });
    const { POST } = await import('../route');
    const res = await POST(postReq({ units: 12 }), ctx());
    expect(res.status).toBe(404);
    expect(enableStockTrackingMock).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------
describe('POST inventory — validation de `units` (fail-closed, aucune coercition)', () => {
  const invalides: Array<[string, unknown]> = [
    ['absent', undefined],
    ['null', null],
    ['négatif', -1],
    ['décimal', 5.5],
    ['chaîne numérique', '5'],
    ['chaîne vide', ''],
    ['booléen', true],
    ['tableau', [5]],
    ['objet', { units: 5 }],
    ['NaN sérialisé en null', NaN],
    ['Infinity sérialisé en null', Infinity],
  ];

  for (const [label, value] of invalides) {
    it(`units ${label} -> 400, et la RPC n'est jamais appelée`, async () => {
      const { POST } = await import('../route');
      const res = await POST(postReq({ units: value }), ctx());
      expect(res.status).toBe(400);
      expect(enableStockTrackingMock).not.toHaveBeenCalled();
    });
  }

  it('units = 0 est VALIDE : « je n\'en ai plus » est un comptage, pas une erreur', async () => {
    const { POST } = await import('../route');
    const res = await POST(postReq({ units: 0 }), ctx());
    expect(res.status).toBe(200);
    expect(enableStockTrackingMock).toHaveBeenCalledWith(PRODUCT_ID, 0);
  });

  it('corps totalement absent -> 400 (jamais une exception 500)', async () => {
    const { POST } = await import('../route');
    const req = new Request(`https://x.test/api/shop/products/${PRODUCT_ID}/inventory`, {
      method: 'POST', headers: { authorization: 'Bearer owner-token' },
    });
    expect((await POST(req, ctx())).status).toBe(400);
  });

  it('la validation passe APRÈS l\'admission : un Mode 1 avec units invalide obtient 403, pas 400', async () => {
    siteLookupMock.mockResolvedValue({
      data: { id: 'my-site-id', mode: 1, owner_id: 'owner-id', owner_email: 'owner@test.com' }, error: null,
    });
    const { POST } = await import('../route');
    expect((await POST(postReq({ units: -3 }), ctx())).status).toBe(403);
  });
});

// ------------------------------------------------------------
describe('POST inventory — la route TRADUIT le résultat de la RPC, elle ne le rejoue pas', () => {
  it('passe toujours par enable_stock_tracking, jamais par une écriture directe', async () => {
    const { POST } = await import('../route');
    await POST(postReq({ units: 7 }), ctx());
    expect(enableStockTrackingMock).toHaveBeenCalledTimes(1);
    expect(enableStockTrackingMock).toHaveBeenCalledWith(PRODUCT_ID, 7);
    expect(disableStockTrackingMock).not.toHaveBeenCalled();
  });

  it('refus de la BARRIÈRE de recomptage -> 409, message relayé tel quel', async () => {
    enableStockTrackingMock.mockResolvedValue({
      ok: false,
      reason: 'STOCK_TRACKING_REQUIRES_COUNT: reactivating stock tracking requires a fresh count',
    });
    const { POST } = await import('../route');
    const res = await POST(postReq({ units: 5 }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('STOCK_TRACKING_REQUIRES_COUNT');
  });

  it('INVALID_ARGUMENT côté base -> 400', async () => {
    enableStockTrackingMock.mockResolvedValue({ ok: false, reason: 'INVALID_ARGUMENT: p_stock must be >= 0' });
    const { POST } = await import('../route');
    expect((await POST(postReq({ units: 5 }), ctx())).status).toBe(400);
  });

  it('PRODUCT_NOT_FOUND côté base (course : suppression entre la lecture et l\'écriture) -> 404', async () => {
    enableStockTrackingMock.mockResolvedValue({ ok: false, reason: 'PRODUCT_NOT_FOUND' });
    const { POST } = await import('../route');
    expect((await POST(postReq({ units: 5 }), ctx())).status).toBe(404);
  });

  it('refus métier inconnu -> 409 (fail-closed : jamais 200 sur un refus)', async () => {
    enableStockTrackingMock.mockResolvedValue({ ok: false, reason: 'quelque chose de nouveau' });
    const { POST } = await import('../route');
    expect((await POST(postReq({ units: 5 }), ctx())).status).toBe(409);
  });

  it('panne de TRANSPORT -> 500, jamais 409 : une panne n\'est pas un refus métier', async () => {
    enableStockTrackingMock.mockResolvedValue({ ok: false, reason: 'connection reset', transport: true });
    const { POST } = await import('../route');
    expect((await POST(postReq({ units: 5 }), ctx())).status).toBe(500);
  });

  it('exception inattendue -> 500 (jamais une réponse implicitement réussie)', async () => {
    enableStockTrackingMock.mockRejectedValue(new Error('boom'));
    const { POST } = await import('../route');
    expect((await POST(postReq({ units: 5 }), ctx())).status).toBe(500);
  });
});

// ------------------------------------------------------------
describe('DELETE inventory — arrêt du suivi', () => {
  it('propriétaire Mode 2 -> 200 et track_inventory = false', async () => {
    const { DELETE } = await import('../route');
    const res = await DELETE(deleteReq(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, product_id: PRODUCT_ID, track_inventory: false });
    expect(disableStockTrackingMock).toHaveBeenCalledWith(PRODUCT_ID);
  });

  it('ne reçoit AUCUN autre argument : ni stock, ni stock_counted_at', async () => {
    const { DELETE } = await import('../route');
    await DELETE(deleteReq(), ctx());
    expect(disableStockTrackingMock.mock.calls[0]).toEqual([PRODUCT_ID]);
  });

  it('n\'appelle jamais enable_stock_tracking (aucun comptage n\'est affirmé en désactivant)', async () => {
    const { DELETE } = await import('../route');
    await DELETE(deleteReq(), ctx());
    expect(enableStockTrackingMock).not.toHaveBeenCalled();
  });

  it('site Mode 1 -> 403, aucune écriture', async () => {
    siteLookupMock.mockResolvedValue({
      data: { id: 'my-site-id', mode: 1, owner_id: 'owner-id', owner_email: 'owner@test.com' }, error: null,
    });
    const { DELETE } = await import('../route');
    expect((await DELETE(deleteReq(), ctx())).status).toBe(403);
    expect(disableStockTrackingMock).not.toHaveBeenCalled();
  });

  it('autre propriétaire -> 403, aucune écriture', async () => {
    siteLookupMock.mockResolvedValue({
      data: { id: 'other-site', mode: 2, owner_id: 'someone-else', owner_email: 'other@test.com' }, error: null,
    });
    const { DELETE } = await import('../route');
    expect((await DELETE(deleteReq(), ctx())).status).toBe(403);
    expect(disableStockTrackingMock).not.toHaveBeenCalled();
  });

  it('non authentifié -> 401, aucune écriture', async () => {
    const { DELETE } = await import('../route');
    expect((await DELETE(deleteReq(null), ctx())).status).toBe(401);
    expect(disableStockTrackingMock).not.toHaveBeenCalled();
  });

  it('produit inexistant -> 404, aucune écriture', async () => {
    getProductMock.mockResolvedValue(null);
    const { DELETE } = await import('../route');
    expect((await DELETE(deleteReq(), ctx())).status).toBe(404);
    expect(disableStockTrackingMock).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------
describe('IDEMPOTENCE ET REJEU — un double clic ne doit rien casser', () => {
  it('deux POST identiques : deux comptages, la même valeur, aucun cumul', async () => {
    const { POST } = await import('../route');
    await POST(postReq({ units: 12 }), ctx());
    await POST(postReq({ units: 12 }), ctx());
    expect(enableStockTrackingMock).toHaveBeenCalledTimes(2);
    expect(enableStockTrackingMock.mock.calls[0]).toEqual([PRODUCT_ID, 12]);
    // Le second appel repose la MÊME valeur absolue -- jamais `stock + 12`.
    // Un comptage est une affirmation, pas un delta : c'est ce qui rend le
    // rejeu inoffensif par construction.
    expect(enableStockTrackingMock.mock.calls[1]).toEqual([PRODUCT_ID, 12]);
  });

  it('recompter un produit DÉJÀ suivi est l\'opération normale, pas une erreur', async () => {
    enableStockTrackingMock.mockResolvedValue({ ok: true, stock: 40, stock_counted_at: '2026-08-24T11:00:00Z' });
    const { POST } = await import('../route');
    const res = await POST(postReq({ units: 40 }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).stock).toBe(40);
  });

  it('deux DELETE successifs -> 200 les deux fois', async () => {
    const { DELETE } = await import('../route');
    expect((await DELETE(deleteReq(), ctx())).status).toBe(200);
    expect((await DELETE(deleteReq(), ctx())).status).toBe(200);
  });

  it('cycle complet : compter -> ne plus suivre -> recompter', async () => {
    const { POST, DELETE } = await import('../route');
    expect((await POST(postReq({ units: 5 }), ctx())).status).toBe(200);
    expect((await DELETE(deleteReq(), ctx())).status).toBe(200);
    expect((await POST(postReq({ units: 9 }), ctx())).status).toBe(200);
    // La réactivation repasse par la RPC -- seul chemin qui fasse avancer
    // `stock_counted_at`, donc seul chemin que la barrière laisse passer.
    expect(enableStockTrackingMock).toHaveBeenCalledTimes(2);
  });
});

// ------------------------------------------------------------
// DETTE 6d — CE BLOC A CHANGÉ DE CAMP, ET C'ÉTAIT SA FONCTION.
//
// Écrit à l'étape 7, il figeait un comportement HÉRITÉ : `getProduct()`
// transmettait l'id à PostgreSQL, qui refusait `not-a-uuid`, l'erreur
// remontait au try/catch et donnait 500 — avec, dans le corps, le message
// Postgres brut. C'était consigné, pas approuvé :
//
//     « Consigné plutôt que corrigé — hors périmètre de l'étape 7. »
//
// La dette 6d le corrige. `requireProductOwner` vérifie désormais la FORME de
// l'identifiant AVANT toute requête : un segment qui n'est pas un uuid ne
// désigne aucun produit, donc 404, avec le même message contrôlé qu'un uuid
// bien formé mais inexistant. Ces deux tests sont passés au rouge à la
// correction (mesuré : « expected 404 to be 500 » ×2) puis retournés — c'est
// exactement ce qu'on attend d'un test de caractérisation.
// ------------------------------------------------------------
describe('DETTE 6d — id non-UUID : 404 contrôlé, jamais 500', () => {
  it('POST avec un id non-UUID -> 404, message contrôlé, aucune écriture', async () => {
    const { POST } = await import('../route');
    const res = await POST(postReq({ units: 5 }), ctx('not-a-uuid'));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Product not found');
    expect(enableStockTrackingMock).not.toHaveBeenCalled();
  });

  it('DELETE avec un id non-UUID -> 404, aucune écriture', async () => {
    const { DELETE } = await import('../route');
    const res = await DELETE(deleteReq(), ctx('not-a-uuid'));

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Product not found');
    expect(disableStockTrackingMock).not.toHaveBeenCalled();
  });

  it('la base n’est même plus interrogée : la forme est refusée avant getProduct', async () => {
    getProductMock.mockClear();
    const { POST } = await import('../route');
    await POST(postReq({ units: 5 }), ctx('not-a-uuid'));
    expect(getProductMock).not.toHaveBeenCalled();
  });

  it('AUCUN message Postgres ne peut sortir — ni type, ni moteur, ni fonction interne', async () => {
    const { POST } = await import('../route');
    for (const mauvais of ['not-a-uuid', '../../etc/passwd', "1' or '1'='1", '11111111-1111-4111-8111-11111111111', '']) {
      const res = await POST(postReq({ units: 5 }), ctx(mauvais));
      const brut = JSON.stringify(await res.json());
      expect(res.status, mauvais).toBe(404);
      expect(brut, mauvais).not.toMatch(/invalid input syntax|uuid|getProduct|postgres/i);
    }
  });

  it('un uuid bien formé mais inconnu -> MÊME réponse : rien ne distingue les deux cas', async () => {
    getProductMock.mockResolvedValue(null);
    const { POST } = await import('../route');
    const inconnu = await POST(postReq({ units: 5 }), ctx('22222222-2222-4222-8222-222222222222'));
    const malforme = await POST(postReq({ units: 5 }), ctx('not-a-uuid'));

    expect(inconnu.status).toBe(malforme.status);
    expect(await inconnu.json()).toEqual(await malforme.json());
  });

  it('un uuid VALIDE continue de fonctionner exactement comme avant', async () => {
    const { POST } = await import('../route');
    expect((await POST(postReq({ units: 7 }), ctx())).status).toBe(200);
  });
});
