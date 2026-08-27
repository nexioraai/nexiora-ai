import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit Reseller/CJ — verrouille : sélection des commandes éligibles (budget
// non épuisé OU verrou processing abandonné), traitement séquentiel (jamais
// Promise.all), isolation (aucune commande hors périmètre CJ n'est touchée).

const startCronRunMock = vi.fn();
const finishCronRunMock = vi.fn();
vi.mock('@/lib/cron-tracker', () => ({
  startCronRun: (...a: unknown[]) => startCronRunMock(...a),
  finishCronRun: (...a: unknown[]) => finishCronRunMock(...a),
}));

const fulfillCjOrderMock = vi.fn();
vi.mock('@/lib/cj/fulfill', () => ({
  fulfillCjOrder: (...a: unknown[]) => fulfillCjOrderMock(...a),
  MAX_CREATE_ATTEMPTS: 3,
  STALE_LOCK_MS: 15 * 60 * 1000,
}));

const fromMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

import { GET } from '../route';

function chain(data: unknown) {
  const c: any = {};
  const self = () => c;
  c.select = vi.fn(self);
  c.eq = vi.fn(self);
  c.in = vi.fn(self);
  c.lt = vi.fn(self);
  c.or = vi.fn(self);
  c.limit = vi.fn(async () => ({ data, error: null }));
  return c;
}

function req(token = 'test-secret') {
  return new Request('https://x.test/api/cron/cj-fulfillment-reconciliation', {
    headers: { authorization: 'Bearer ' + token },
  }) as any;
}

beforeEach(() => {
  fromMock.mockReset();
  fulfillCjOrderMock.mockReset();
  startCronRunMock.mockReset();
  finishCronRunMock.mockReset();
  startCronRunMock.mockResolvedValue('run-1');
  fulfillCjOrderMock.mockResolvedValue([]);
  // Fail-closed (audit cj-tracking / clôture Mode 3) : un secret valide est
  // désormais requis pour atteindre la logique de sélection -- ces tests
  // couvrent le traitement, pas la garde d'auth (testée séparément ci-dessous).
  process.env.CRON_SECRET = 'test-secret';
});

describe('GET /api/cron/cj-fulfillment-reconciliation', () => {
  it('traite pending/failed sous budget ET processing stale, sans doublon, sans Promise.all (séquentiel)', async () => {
    fromMock
      .mockImplementationOnce(() => chain([{ id: 'order-a' }, { id: 'order-b' }])) // pending/failed
      .mockImplementationOnce(() => chain([{ id: 'order-b' }, { id: 'order-c' }])); // processing stale (order-b en double, dédupliqué)

    const callOrder: string[] = [];
    fulfillCjOrderMock.mockImplementation(async (id: string) => {
      callOrder.push(id);
      return [];
    });

    const res = await GET(req());
    const body = await res.json();

    expect(body.eligible).toBe(3); // a, b, c -- b dédupliqué une seule fois
    // Sequentiel, jamais Promise.all : callOrder n'aurait aucune garantie
    // d'ordre sous parallelisme reel -- throttle desormais global (cjFetch),
    // plus de sleep manuel a verifier ici.
    expect(callOrder).toEqual(['order-a', 'order-b', 'order-c']);
  });

  it('aucune commande éligible -> aucun appel fulfillCjOrder, aucune erreur', async () => {
    fromMock.mockImplementationOnce(() => chain([])).mockImplementationOnce(() => chain([]));
    const res = await GET(req());
    const body = await res.json();
    expect(body.eligible).toBe(0);
    expect(fulfillCjOrderMock).not.toHaveBeenCalled();
  });

  it('une erreur sur une commande ne bloque pas le traitement des suivantes', async () => {
    fromMock
      .mockImplementationOnce(() => chain([{ id: 'order-a' }, { id: 'order-b' }]))
      .mockImplementationOnce(() => chain([]));
    fulfillCjOrderMock.mockImplementationOnce(() => Promise.reject(new Error('boom'))).mockResolvedValueOnce([]);

    const res = await GET(req());
    const body = await res.json();
    expect(body.processed).toBe(2);
    expect(body.errors).toBe(1);
    expect(fulfillCjOrderMock).toHaveBeenCalledTimes(2);
  });

  it('mauvais secret -> 401, aucun traitement', async () => {
    const res = await GET(req('mauvais-secret'));
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('CRON_SECRET absent (fail-closed, pas fail-open) -> 401 meme avec un header present', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req('peu-importe'));
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('aucun header Authorization -> 401', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(new Request('https://x.test/api/cron/cj-fulfillment-reconciliation') as any);
    expect(res.status).toBe(401);
  });

  it('bon secret -> passe l\'authentification (traitement reel, pas 401)', async () => {
    fromMock.mockImplementationOnce(() => chain([])).mockImplementationOnce(() => chain([]));
    const res = await GET(req('test-secret'));
    expect(res.status).not.toBe(401);
  });
});
