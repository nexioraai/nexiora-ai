import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Audit timeouts fournisseurs (lot prioritaire) : cjFetch() est le point
// d'entrée HTTP unique de tout le flux CJ (fulfillment, tracking,
// réconciliation, crons catalogue, shipping-estimate visiteur, checkout
// live via cj-adapter.calculateShipping). Avant ce correctif, aucun timeout
// -- un fournisseur qui ne répond jamais bloquait indéfiniment l'appelant.
// Isole `acquireCjSlot`/`getCjToken` (déjà testés séparément) pour ne
// vérifier ici que le comportement réel du fetch() sous-jacent.

const acquireCjSlotMock = vi.fn();
vi.mock('../rateLimiter', () => ({
  acquireCjSlot: (...a: unknown[]) => acquireCjSlotMock(...a),
}));

const getCjTokenMock = vi.fn();
vi.mock('../auth', () => ({
  getCjToken: (...a: unknown[]) => getCjTokenMock(...a),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  acquireCjSlotMock.mockReset().mockResolvedValue(undefined);
  getCjTokenMock.mockReset().mockResolvedValue('fake-token');
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.resetModules();
});

describe('cjFetch — comportement réseau réel', () => {
  it('appel nominal : résout et renvoie data.data quand result=true', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: true, data: { foo: 'bar' } }), { status: 200 })
    ) as any;

    const { cjFetch } = await import('../client');
    const result = await cjFetch('m@x.com', 'key', '/product/list');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('timeout : un fournisseur qui ne répond jamais rejette dans le délai borné, ne bloque pas indéfiniment', async () => {
    global.fetch = vi.fn((url: any, init: any) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'TimeoutError')));
      });
    }) as any;

    const { cjFetch } = await import('../client');
    const start = Date.now();
    await expect(cjFetch('m@x.com', 'key', '/product/list')).rejects.toThrow();
    // Respect du délai maximal : le timeout par défaut de fetchWithTimeout
    // (15s) doit borner l'attente, jamais un blocage indéfini.
    expect(Date.now() - start).toBeLessThan(16_000);
  }, 20_000);

  it('erreur réseau (DNS/connexion) : rejette immédiatement, jamais interprétée comme un succès', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed')) as any;

    const { cjFetch } = await import('../client');
    await expect(cjFetch('m@x.com', 'key', '/product/list')).rejects.toThrow('fetch failed');
  });

  it('erreur applicative CJ (result=false) : CjApiError avec code et httpStatus réels, jamais confondue avec un timeout', async () => {
    global.fetch = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ result: false, message: 'Too Many Requests', code: 1600200 }), { status: 429 })
    ) as any;

    const { cjFetch, CjApiError } = await import('../client');
    let caught: unknown;
    try {
      await cjFetch('m@x.com', 'key', '/product/list');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CjApiError);
    expect(caught).toMatchObject({ code: 1600200, httpStatus: 429 });
  });

  it('5xx : propagé comme une erreur CJ normale (comportement existant préservé, pas de traitement spécial du timeout)', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: false, message: 'Internal error' }), { status: 500 })
    ) as any;

    const { cjFetch } = await import('../client');
    await expect(cjFetch('m@x.com', 'key', '/product/list')).rejects.toMatchObject({ httpStatus: 500 });
  });

  it("absence de retry infini : cjFetch n'effectue qu'un seul appel réseau par invocation, aucune boucle interne", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: true, data: {} }), { status: 200 }));
    global.fetch = fetchSpy as any;

    const { cjFetch } = await import('../client');
    await cjFetch('m@x.com', 'key', '/product/list');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('acquireCjSlot() (rate-limit global) est bien invoqué avant chaque appel réseau', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: true, data: {} }))) as any;
    const { cjFetch } = await import('../client');
    await cjFetch('m@x.com', 'key', '/product/list');
    expect(acquireCjSlotMock).toHaveBeenCalledTimes(1);
  });
});
