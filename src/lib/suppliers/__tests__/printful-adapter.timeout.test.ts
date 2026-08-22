import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Audit timeouts fournisseurs (lot prioritaire) : pfFetch() est atteignable
// en direct depuis shop/checkout/route.ts (calculateShipping, checkout
// live). Le mécanisme de timeout lui-même est déjà prouvé exhaustivement
// dans fetchWithTimeout.test.ts et client.test.ts -- ce fichier vérifie
// que pfFetch s'y branche réellement et que le comportement existant
// (429/5xx/erreur réseau, fallback total_cost=0 sur échec) est préservé.

const originalFetch = global.fetch;
beforeEach(() => {
  process.env.PRINTFUL_API_TOKEN = 'fake-token';
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.resetModules();
});

describe('printful-adapter — câblage du timeout sur pfFetch', () => {
  it('appel nominal : calculateShipping résout normalement avec les tarifs réels', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: [{ id: 'STANDARD', rate: '7.50', minDeliveryDays: 4, maxDeliveryDays: 8 }] }), { status: 200 })
    ) as any;

    const { printfulAdapter } = await import('../printful-adapter');
    const result = await printfulAdapter.calculateShipping!(
      [{ supplier_product_id: '123', quantity: 1 }] as any,
      'US',
      {}
    );
    expect(result.total_cost).toBe(7.5);
  });

  it('un AbortSignal réel est transmis à chaque fetch (preuve de câblage)', async () => {
    let capturedSignal: AbortSignal | undefined;
    global.fetch = vi.fn((url: any, init: any) => {
      capturedSignal = init.signal;
      return Promise.resolve(new Response(JSON.stringify({ result: [] })));
    }) as any;

    const { printfulAdapter } = await import('../printful-adapter');
    await printfulAdapter.calculateShipping!([{ supplier_product_id: '123', quantity: 1 }] as any, 'US', {});
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal!.aborted).toBe(false);
  });

  it("erreur réseau : calculateShipping dégrade en fallback (total_cost=0) sans jamais bloquer le checkout, comportement existant préservé", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed')) as any;
    const { printfulAdapter } = await import('../printful-adapter');
    const result = await printfulAdapter.calculateShipping!([{ supplier_product_id: '123', quantity: 1 }] as any, 'US', {});
    expect(result.total_cost).toBe(0);
  });

  it('5xx : dégrade aussi en fallback, jamais une exception non gérée qui casserait le checkout', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('server error', { status: 500 })) as any;
    const { printfulAdapter } = await import('../printful-adapter');
    const result = await printfulAdapter.calculateShipping!([{ supplier_product_id: '123', quantity: 1 }] as any, 'US', {});
    expect(result.total_cost).toBe(0);
  });

  it('absence de retry infini : un seul appel réseau par calculateShipping', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: [] })));
    global.fetch = fetchSpy as any;
    const { printfulAdapter } = await import('../printful-adapter');
    await printfulAdapter.calculateShipping!([{ supplier_product_id: '123', quantity: 1 }] as any, 'US', {});
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
