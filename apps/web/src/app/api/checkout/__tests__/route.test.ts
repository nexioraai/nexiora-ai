import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit Mode 3/POD BRAND, lot Stripe -- verrouille la garde contre la course
// de double-publication : deux déclenchements concurrents (double-clic, deux
// onglets) sans clé d'idempotence créaient deux clients Stripe réels
// distincts pour le même site, le second écrasant silencieusement
// stripe_customer_id du premier -- un paiement réel sur la session
// "orpheline" ne publiait jamais le site (webhook incapable de retrouver
// le site via un stripe_customer_id qui ne lui appartient plus).
//
// ============================================================
// DETTE 6a, EXTENSION -- LE HARNAIS APPLIQUE MAINTENANT LES FILTRES.
//
// L'ancienne fixture rendait la ligne quelle que soit la requête : `b.eq`
// renvoyait `b` et `single()` rendait une valeur fixe. Avec elle, un test de
// propriété n'aurait rien prouvé -- l'auteur du test aurait DÉCIDÉ la réponse
// en passant `data: null`, et l'assertion aurait tenu avec ou sans la garde.
// Ici les lignes vivent dans `sitesRows` et ne sont rendues que si TOUS les
// filtres posés par le code les apparient : c'est la GARDE qui est sous test,
// pas la prémisse du test. Les cinq tests d'idempotence gardent leur sens
// exact -- ils décrivent seulement leur site au lieu de court-circuiter la
// requête.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

type Row = Record<string, unknown>;
let sitesRows: Row[] = [];
/** Les UPDATE réellement exécutés : payload + filtres. */
let updates: Array<{ payload: Row; filters: [string, unknown][] }> = [];

function makeFrom() {
  return vi.fn((table: string) => {
    if (table !== 'sites') throw new Error('unexpected table: ' + table);
    const filters: [string, unknown][] = [];
    let updatePayload: Row | null = null;
    const b: any = {};
    b.select = () => b;
    b.eq = (col: string, val: unknown) => { filters.push([col, val]); return b; };
    b.update = (payload: Row) => { updatePayload = payload; return b; };
    const match = () => sitesRows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null;
    const settle = () => {
      if (updatePayload) {
        const cible = match();
        if (cible) Object.assign(cible, updatePayload);
        updates.push({ payload: updatePayload, filters: [...filters] });
        return { data: cible, error: null };
      }
      return { data: match(), error: null };
    };
    b.single = async () => settle();
    b.maybeSingle = async () => settle();
    b.then = (resolve: any) => resolve(settle());
    return b;
  });
}
let fromMock: ReturnType<typeof makeFrom>;
vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() {
    return { from: (...a: [string]) => fromMock(...a) };
  },
}));

const customersCreateMock = vi.fn();
const sessionsCreateMock = vi.fn();
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    customers: { create: (...a: unknown[]) => customersCreateMock(...a) },
    checkout: { sessions: { create: (...a: unknown[]) => sessionsCreateMock(...a) } },
  }),
}));

const USER = { id: 'user-1', email: 'merchant@example.com' };

/** Une ligne `sites` telle qu'elle existe réellement, avec LES DEUX identités. */
function siteRow(over: Row = {}): Row {
  return {
    id: 'site-1',
    slug: 'my-shop',
    owner_id: USER.id,
    owner_email: USER.email,
    stripe_customer_id: null,
    ...over,
  };
}

function req(slug = 'my-shop', headers: Record<string, string> = {}) {
  return new Request('https://woorri.test/api/checkout', {
    method: 'POST',
    headers: { authorization: 'Bearer test-token', origin: 'https://woorri.test', ...headers },
    body: JSON.stringify({ slug }),
  });
}

beforeEach(() => {
  fromMock = makeFrom();
  sitesRows = [];
  updates = [];
  getUserMock.mockReset().mockResolvedValue({ data: { user: { ...USER } }, error: null });
  customersCreateMock.mockReset().mockResolvedValue({ id: 'cus_new' });
  sessionsCreateMock.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.test/session' });
  process.env.STRIPE_PRICE_ID = 'price_test';
});

describe('POST /api/checkout — clé d\'idempotence sur la création du client Stripe', () => {
  it('site sans stripe_customer_id -> customers.create() reçoit une idempotencyKey dérivée du slug (stable, pas générée à chaque appel)', async () => {
    sitesRows = [siteRow()];

    const { POST } = await import('../route');
    await POST(req('my-shop'));

    expect(customersCreateMock).toHaveBeenCalledTimes(1);
    const [, options] = customersCreateMock.mock.calls[0];
    expect(options).toMatchObject({ idempotencyKey: expect.stringContaining('my-shop') });
  });

  it('deux slugs différents -> deux idempotencyKey différentes (pas de collision entre sites)', async () => {
    sitesRows = [
      siteRow({ id: 'site-a', slug: 'shop-a' }),
      siteRow({ id: 'site-b', slug: 'shop-b' }),
    ];

    const { POST } = await import('../route');
    await POST(req('shop-a'));
    await POST(req('shop-b'));

    const keyA = customersCreateMock.mock.calls[0][1].idempotencyKey;
    const keyB = customersCreateMock.mock.calls[1][1].idempotencyKey;
    expect(keyA).not.toBe(keyB);
  });

  it('deux appels concurrents pour le MÊME site -> la même idempotencyKey est envoyée deux fois (Stripe garantit alors le même client en retour, jamais deux clients réels)', async () => {
    sitesRows = [siteRow()];
    // Simule la garantie Stripe : même idempotencyKey -> même objet client renvoyé.
    customersCreateMock.mockImplementation(async () => ({ id: 'cus_shared' }));

    const { POST } = await import('../route');
    const [resA, resB] = await Promise.all([POST(req('my-shop')), POST(req('my-shop'))]);

    expect(resA.status).not.toBe(500);
    expect(resB.status).not.toBe(500);
    const keyA = customersCreateMock.mock.calls[0][1].idempotencyKey;
    const keyB = customersCreateMock.mock.calls[1][1].idempotencyKey;
    expect(keyA).toBe(keyB);
  });

  it('site avec stripe_customer_id déjà présent -> aucun nouvel appel customers.create (comportement existant préservé)', async () => {
    sitesRows = [siteRow({ stripe_customer_id: 'cus_existing' })];

    const { POST } = await import('../route');
    const res = await POST(req('my-shop'));
    const body = await res.json();

    expect(customersCreateMock).not.toHaveBeenCalled();
    expect(sessionsCreateMock).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_existing' }));
    expect(body.url).toBe('https://checkout.stripe.test/session');
  });

  it('site introuvable -> 404, aucun appel Stripe', async () => {
    sitesRows = [];

    const { POST } = await import('../route');
    const res = await POST(req('unknown-shop'));

    expect(res.status).toBe(404);
    expect(customersCreateMock).not.toHaveBeenCalled();
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// DETTE 6a, EXTENSION -- L'IDENTITE EST `owner_id`, PAS L'ADRESSE.
//
// `sites.owner_email` est écrite une seule fois, à la création, et aucun
// update ne la touche jamais. Un propriétaire qui change d'adresse laisse la
// colonne figée sur l'ancienne : quiconque obtient ensuite cette adresse
// devenait propriétaire aux yeux de cette route -- et pouvait souscrire un
// abonnement Stripe réel sur le site d'autrui.
// ============================================================

describe('DETTE 6a — propriété du site avant tout appel Stripe', () => {
  it('🔴 CAS DÉCISIF : owner_id DIFFÉRENT mais owner_email identique -> 403, AUCUN appel Stripe', async () => {
    sitesRows = [siteRow({ owner_id: 'quelquun-dautre', owner_email: USER.email })];

    const { POST } = await import('../route');
    const res = await POST(req('my-shop'));

    expect(res.status).toBe(403);
    expect(customersCreateMock).not.toHaveBeenCalled();
    expect(sessionsCreateMock).not.toHaveBeenCalled();
    expect(updates, 'aucune écriture sur refus').toEqual([]);
  });

  it('owner_id CORRECT mais adresse changée -> ACCEPTÉ (l’identité ne se périme pas)', async () => {
    sitesRows = [siteRow({ owner_id: USER.id, owner_email: 'ancienne@example.com' })];

    const { POST } = await import('../route');
    const res = await POST(req('my-shop'));

    expect(res.status).toBe(200);
    expect(customersCreateMock).toHaveBeenCalledTimes(1);
  });

  it('owner_id NULL + adresse correspondante -> accepté par le repli canonique (site pré-backfill)', async () => {
    sitesRows = [siteRow({ owner_id: null, owner_email: USER.email })];

    const { POST } = await import('../route');
    expect((await POST(req('my-shop'))).status).toBe(200);
  });

  it('owner_id NULL + adresse différente -> 403', async () => {
    sitesRows = [siteRow({ owner_id: null, owner_email: 'autre@example.com' })];

    const { POST } = await import('../route');
    const res = await POST(req('my-shop'));
    expect(res.status).toBe(403);
    expect(customersCreateMock).not.toHaveBeenCalled();
  });

  it('non authentifié (jeton invalide) -> 401, aucun appel Stripe', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });
    sitesRows = [siteRow()];

    const { POST } = await import('../route');
    const res = await POST(req('my-shop'));
    expect(res.status).toBe(401);
    expect(customersCreateMock).not.toHaveBeenCalled();
  });

  it('slug manquant -> 400 (contrat inchangé)', async () => {
    const { POST } = await import('../route');
    const r = new Request('https://woorri.test/api/checkout', {
      method: 'POST',
      headers: { authorization: 'Bearer test-token' },
      body: JSON.stringify({}),
    });
    expect((await POST(r)).status).toBe(400);
  });

  it('l’adresse ne sert plus qu’à Stripe : elle est transmise, jamais comparée', async () => {
    sitesRows = [siteRow({ owner_email: 'figee@example.com' })];   // ≠ USER.email

    const { POST } = await import('../route');
    await POST(req('my-shop'));

    const [payload] = customersCreateMock.mock.calls[0];
    expect(payload.email, 'l’email Stripe vient du JETON, pas de la colonne').toBe(USER.email);
    expect(payload.metadata.owner_email).toBe(USER.email);
  });
});

describe('DETTE 6a — l’écriture de stripe_customer_id vise la ligne déjà autorisée', () => {
  it('l’UPDATE est ancré sur `id`, et n’utilise NI owner_email NI owner_id', async () => {
    sitesRows = [siteRow()];

    const { POST } = await import('../route');
    await POST(req('my-shop'));

    expect(updates).toHaveLength(1);
    const cols = updates[0].filters.map(([c]) => c);
    expect(cols).toEqual(['id']);
    expect(updates[0].filters[0][1]).toBe('site-1');
  });

  it('`stripe_customer_id` est effectivement écrit sur CETTE ligne', async () => {
    sitesRows = [siteRow()];

    const { POST } = await import('../route');
    await POST(req('my-shop'));

    expect(sitesRows[0].stripe_customer_id).toBe('cus_new');
  });

  it('aucune autre ligne n’est touchée', async () => {
    sitesRows = [siteRow(), siteRow({ id: 'site-2', slug: 'autre-shop' })];

    const { POST } = await import('../route');
    await POST(req('my-shop'));

    expect(sitesRows[0].stripe_customer_id).toBe('cus_new');
    expect(sitesRows[1].stripe_customer_id, 'le voisin est intact').toBeNull();
  });

  it('site déjà pourvu -> aucune écriture du tout', async () => {
    sitesRows = [siteRow({ stripe_customer_id: 'cus_existing' })];

    const { POST } = await import('../route');
    await POST(req('my-shop'));

    expect(updates).toEqual([]);
  });
});
