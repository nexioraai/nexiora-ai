import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Audit timeouts fournisseurs (lot prioritaire) : glFetch() est atteignable
// en direct depuis shop/checkout/route.ts (calcul de livraison live pendant
// un paiement réel, via calculateShipping) -- avant ce correctif, aucun
// timeout. Le mécanisme de timeout lui-même (AbortSignal.timeout réel,
// respect du délai maximal) est déjà prouvé exhaustivement dans
// fetchWithTimeout.test.ts et client.test.ts -- ce fichier vérifie
// spécifiquement que glFetch s'y branche réellement (signal transmis) et
// que le comportement existant (429/5xx/erreur réseau) est préservé.

const originalFetch = global.fetch;
beforeEach(() => {
  process.env.GELATO_API_KEY = 'fake-key';
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.resetModules();
});

describe('gelato-adapter — câblage du timeout sur glFetch', () => {
  it('appel nominal : calculateShipping résout normalement', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ quotes: [{ products: [{ price: 10, currency: 'USD' }], shipmentMethods: [{ price: 5, minDeliveryDays: 3, maxDeliveryDays: 8 }] }] }), { status: 200 })
    ) as any;

    const { gelatoAdapter } = await import('../gelato-adapter');
    const result = await gelatoAdapter.calculateShipping!(
      [{ supplier_product_id: 'p1', quantity: 1 }] as any,
      'US',
      {}
    );
    expect(result.total_cost).toBe(15);
  });

  it('un AbortSignal réel est transmis à chaque fetch (preuve de câblage, pas juste de la présence de code)', async () => {
    let capturedSignal: AbortSignal | undefined;
    global.fetch = vi.fn((url: any, init: any) => {
      capturedSignal = init.signal;
      return Promise.resolve(new Response(JSON.stringify({ quotes: [] })));
    }) as any;

    const { gelatoAdapter } = await import('../gelato-adapter');
    await gelatoAdapter.calculateShipping!([{ supplier_product_id: 'p1', quantity: 1 }] as any, 'US', {}).catch(() => {});
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal!.aborted).toBe(false); // pas déjà expiré à l'appel nominal
  });

  it('erreur réseau : propagée sans être avalée silencieusement', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed')) as any;
    const { gelatoAdapter } = await import('../gelato-adapter');
    await expect(
      gelatoAdapter.calculateShipping!([{ supplier_product_id: 'p1', quantity: 1 }] as any, 'US', {})
    ).rejects.toThrow();
  });

  it('5xx : comportement existant préservé (res.ok=false -> Error explicite)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('server error', { status: 500 })) as any;
    const { gelatoAdapter } = await import('../gelato-adapter');
    await expect(
      gelatoAdapter.calculateShipping!([{ supplier_product_id: 'p1', quantity: 1 }] as any, 'US', {})
    ).rejects.toThrow(/Gelato 500/);
  });

  it("absence de retry infini : un seul appel réseau par calculateShipping (pas de boucle interne)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ quotes: [] })));
    global.fetch = fetchSpy as any;
    const { gelatoAdapter } = await import('../gelato-adapter');
    await gelatoAdapter.calculateShipping!([{ supplier_product_id: 'p1', quantity: 1 }] as any, 'US', {});
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
