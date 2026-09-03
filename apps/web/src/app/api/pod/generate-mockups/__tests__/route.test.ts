import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit Mode 3/POD BRAND, lot mockups -- cause racine : cette route
// (create-task Printful réel, facturé, + écriture pod_designs.mockups)
// n'avait AUCUNE authentification ni vérification de propriété. N'importe
// quel appelant non authentifié pouvait :
//   1. déclencher un vrai appel Printful facturé sur la boutique de
//      n'importe qui via son slug (aucune limite de coût/quota) ;
//   2. en mode "poll", injecter le résultat d'un mockup (généré pour un
//      site A) dans pod_designs.mockups d'un site B de son choix, en
//      passant simplement un `slug` différent dans le corps de la requête
//      -- une pollution/injection croisée entre boutiques.
// Corrigé via requireSiteOwner() (même garde que catalog/enhance,
// catalog/curate). Ces tests verrouillent que l'appel est désormais
// bloqué sans propriété réelle, dans les deux modes (create et poll).

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const siteSelectMock = vi.fn();
const siteUpdateMock = vi.fn();
function makeFrom() {
  return vi.fn((table: string) => {
    const b: any = {};
    let mode: 'select' | 'update' = 'select';
    b.select = () => b;
    b.eq = () => b;
    b.update = (_payload: unknown) => {
      mode = 'update';
      return b;
    };
    b.single = async () => siteSelectMock();
    b.maybeSingle = async () => siteSelectMock();
    b.then = (resolve: any) => {
      if (mode === 'update') siteUpdateMock(table);
      return resolve({ data: null, error: null });
    };
    return b;
  });
}
let fromMock: ReturnType<typeof makeFrom>;
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    get from() {
      return fromMock;
    },
    storage: { from: () => ({ upload: vi.fn().mockResolvedValue({ data: {}, error: null }) }) },
  },
}));

const originalFetch = global.fetch;

function req(body: unknown, token?: string) {
  return new Request('https://x.test/api/pod/generate-mockups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  fromMock = makeFrom();
  getUserMock.mockReset();
  siteSelectMock.mockReset();
  siteUpdateMock.mockReset();
  global.fetch = vi.fn() as any;
});

describe('POST /api/pod/generate-mockups — authentification et propriété (cause racine corrigée)', () => {
  it("aucun token -> 401, AUCUN appel Printful (pas de coût facturé), aucune écriture", async () => {
    const res = await req({ slug: 'victime-shop', index: 0 });
    const response = await (await import('../route')).POST(res);
    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(siteUpdateMock).not.toHaveBeenCalled();
  });

  it("token valide mais PAS propriétaire du site ciblé -> 403, mode create bloqué avant tout appel Printful", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'attacker-id', email: 'attacker@test.com' } }, error: null });
    siteSelectMock.mockResolvedValue({ data: { id: 'victim-site-id', owner_id: 'real-owner-id', pod_designs: [], dropship_type: 'pod_brand' }, error: null });

    const response = await (await import('../route')).POST(req({ slug: 'victime-shop', index: 0 }, 'attacker-token'));
    expect(response.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("mode poll, PAS propriétaire -> 403 -- empêche l'injection croisée d'un mockup dans le pod_designs d'une AUTRE boutique", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'attacker-id', email: 'attacker@test.com' } }, error: null });
    siteSelectMock.mockResolvedValue({ data: { id: 'victim-site-id', owner_id: 'real-owner-id', pod_designs: [], dropship_type: 'pod_brand' }, error: null });

    const response = await (await import('../route')).POST(
      req({ slug: 'victime-shop', action: 'poll', task_keys: [{ task_key: 'tk-from-attacker-own-site', name: 'T-shirt', product_id: 1, variant_id: 2 }] }, 'attacker-token')
    );
    expect(response.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(siteUpdateMock).not.toHaveBeenCalled();
  });

  it("propriétaire réel, mode create, aucun design uploadé -> 400 métier normal (pas un blocage d'auth), preuve que l'authentification n'a pas cassé le chemin légitime", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null });
    siteSelectMock.mockResolvedValue({ data: { id: 'my-site-id', owner_id: 'owner-id', pod_designs: [], dropship_type: 'pod_brand' }, error: null });

    const response = await (await import('../route')).POST(req({ slug: 'my-shop', index: 0 }, 'owner-token'));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/No designs uploaded/);
  });
});

describe('POST /api/pod/generate-mockups — N13 : mode create réservé à pod_brand, même pour le vrai propriétaire', () => {
  it.each([
    ['reseller', 'reseller'],
    ['pod_custom', 'pod_custom'],
    ['null', null],
    ['valeur inattendue', 'legacy_mode_x'],
  ])('propriétaire réel, dropship_type=%s, design présent -> 403, AUCUN appel Printful facturé', async (_label, dropshipType) => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null });
    siteSelectMock.mockResolvedValue({
      data: { id: 'my-site-id', owner_id: 'owner-id', pod_designs: [{ url: 'https://x.test/design.png' }], dropship_type: dropshipType },
      error: null,
    });

    const response = await (await import('../route')).POST(req({ slug: 'my-shop', index: 0 }, 'owner-token'));
    expect(response.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(siteUpdateMock).not.toHaveBeenCalled();
  });

  it('propriétaire réel, dropship_type=pod_brand, design présent -> dépasse la garde N13 (comportement inchangé, atteint la logique métier normale)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'owner-id', email: 'owner@test.com' } }, error: null });
    siteSelectMock.mockResolvedValue({
      data: { id: 'my-site-id', owner_id: 'owner-id', pod_designs: [], dropship_type: 'pod_brand' },
      error: null,
    });

    const response = await (await import('../route')).POST(req({ slug: 'my-shop', index: 0 }, 'owner-token'));
    const body = await response.json();
    // 400 "No designs uploaded" (pas 403) -> prouve que la garde N13 a bien
    // laissé passer pod_brand, l'échec vient de la logique métier normale.
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/No designs uploaded/);
  });
});
