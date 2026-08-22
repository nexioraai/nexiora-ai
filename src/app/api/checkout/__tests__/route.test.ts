import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit Mode 3/POD BRAND, lot Stripe -- verrouille la garde contre la course
// de double-publication : deux déclenchements concurrents (double-clic, deux
// onglets) sans clé d'idempotence créaient deux clients Stripe réels
// distincts pour le même site, le second écrasant silencieusement
// stripe_customer_id du premier -- un paiement réel sur la session
// "orpheline" ne publiait jamais le site (webhook incapable de retrouver
// le site via un stripe_customer_id qui ne lui appartient plus).

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const siteSelectMock = vi.fn();
const siteUpdateMock = vi.fn();
function makeFrom() {
  return vi.fn((table: string) => {
    if (table !== 'sites') throw new Error('unexpected table: ' + table);
    const b: any = {};
    let isUpdate = false;
    b.select = () => b;
    b.eq = () => b;
    b.update = (_payload: unknown) => {
      isUpdate = true;
      return b;
    };
    b.single = async () => siteSelectMock();
    // Le PATCH final (.eq(...).eq(...)) ne lit pas de résultat -- juste noter l'appel.
    b.then = (resolve: any) => {
      if (isUpdate) siteUpdateMock();
      return resolve({ data: null, error: null });
    };
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

function req(slug = 'my-shop') {
  return new Request('https://woorri.test/api/checkout', {
    method: 'POST',
    headers: { authorization: 'Bearer test-token', origin: 'https://woorri.test' },
    body: JSON.stringify({ slug }),
  });
}

beforeEach(() => {
  fromMock = makeFrom();
  getUserMock.mockReset().mockResolvedValue({ data: { user: { email: 'merchant@example.com' } }, error: null });
  siteSelectMock.mockReset();
  siteUpdateMock.mockReset();
  customersCreateMock.mockReset().mockResolvedValue({ id: 'cus_new' });
  sessionsCreateMock.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.test/session' });
  process.env.STRIPE_PRICE_ID = 'price_test';
});

describe('POST /api/checkout — clé d\'idempotence sur la création du client Stripe', () => {
  it('site sans stripe_customer_id -> customers.create() reçoit une idempotencyKey dérivée du slug (stable, pas générée à chaque appel)', async () => {
    siteSelectMock.mockResolvedValue({ data: { slug: 'my-shop', owner_email: 'merchant@example.com', stripe_customer_id: null }, error: null });

    const { POST } = await import('../route');
    await POST(req('my-shop'));

    expect(customersCreateMock).toHaveBeenCalledTimes(1);
    const [, options] = customersCreateMock.mock.calls[0];
    expect(options).toMatchObject({ idempotencyKey: expect.stringContaining('my-shop') });
  });

  it('deux slugs différents -> deux idempotencyKey différentes (pas de collision entre sites)', async () => {
    siteSelectMock
      .mockResolvedValueOnce({ data: { slug: 'shop-a', owner_email: 'merchant@example.com', stripe_customer_id: null }, error: null })
      .mockResolvedValueOnce({ data: { slug: 'shop-b', owner_email: 'merchant@example.com', stripe_customer_id: null }, error: null });

    const { POST } = await import('../route');
    await POST(req('shop-a'));
    await POST(req('shop-b'));

    const keyA = customersCreateMock.mock.calls[0][1].idempotencyKey;
    const keyB = customersCreateMock.mock.calls[1][1].idempotencyKey;
    expect(keyA).not.toBe(keyB);
  });

  it('deux appels concurrents pour le MÊME site -> la même idempotencyKey est envoyée deux fois (Stripe garantit alors le même client en retour, jamais deux clients réels)', async () => {
    siteSelectMock.mockResolvedValue({ data: { slug: 'my-shop', owner_email: 'merchant@example.com', stripe_customer_id: null }, error: null });
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
    siteSelectMock.mockResolvedValue({ data: { slug: 'my-shop', owner_email: 'merchant@example.com', stripe_customer_id: 'cus_existing' }, error: null });

    const { POST } = await import('../route');
    const res = await POST(req('my-shop'));
    const body = await res.json();

    expect(customersCreateMock).not.toHaveBeenCalled();
    expect(sessionsCreateMock).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_existing' }));
    expect(body.url).toBe('https://checkout.stripe.test/session');
  });

  it('site introuvable ou non-propriétaire -> 404, aucun appel Stripe', async () => {
    siteSelectMock.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const { POST } = await import('../route');
    const res = await POST(req('unknown-shop'));

    expect(res.status).toBe(404);
    expect(customersCreateMock).not.toHaveBeenCalled();
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });
});
