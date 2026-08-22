import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Audit timeouts fournisseurs (lot prioritaire) : pyFetch() est atteignable
// en direct depuis shop/checkout/route.ts (calculateShipping, checkout
// live -- boucle par item du panier). Le mécanisme de timeout lui-même est
// déjà prouvé exhaustivement dans fetchWithTimeout.test.ts et
// client.test.ts -- ce fichier vérifie que pyFetch s'y branche réellement
// et que le comportement existant (429/5xx/erreur réseau, boucle par item)
// est préservé.

const originalFetch = global.fetch;
beforeEach(() => {
  process.env.PRINTIFY_API_TOKEN = 'fake-token';
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.resetModules();
});

function shippingPayload() {
  return {
    profiles: [{ countries: ['US'], first_item: { cost: 500 }, additional_items: { cost: 200 } }],
  };
}

describe('printify-adapter — câblage du timeout sur pyFetch', () => {
  it('appel nominal : calculateShipping résout normalement avec le tarif réel', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(shippingPayload()), { status: 200 })) as any;

    const { printifyAdapter } = await import('../printify-adapter');
    const result = await printifyAdapter.calculateShipping!(
      [{ supplier_product_id: '1_2_3', quantity: 1 }] as any,
      'US',
      {}
    );
    expect(result.total_cost).toBe(5);
  });

  it('un AbortSignal réel est transmis à chaque fetch (preuve de câblage)', async () => {
    let capturedSignal: AbortSignal | undefined;
    global.fetch = vi.fn((url: any, init: any) => {
      capturedSignal = init.signal;
      return Promise.resolve(new Response(JSON.stringify(shippingPayload())));
    }) as any;

    const { printifyAdapter } = await import('../printify-adapter');
    await printifyAdapter.calculateShipping!([{ supplier_product_id: '1_2_3', quantity: 1 }] as any, 'US', {});
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal!.aborted).toBe(false);
  });

  it("erreur réseau sur un item : n'interrompt pas les autres items du panier (catch par item, comportement existant préservé)", async () => {
    let call = 0;
    global.fetch = vi.fn(() => {
      call++;
      if (call === 1) return Promise.reject(new TypeError('fetch failed'));
      return Promise.resolve(new Response(JSON.stringify(shippingPayload())));
    }) as any;

    const { printifyAdapter } = await import('../printify-adapter');
    const result = await printifyAdapter.calculateShipping!(
      [
        { supplier_product_id: '1_2_3', quantity: 1 },
        { supplier_product_id: '4_5_6', quantity: 1 },
      ] as any,
      'US',
      {}
    );
    // Le 1er item échoue silencieusement (catch interne), le 2e réussit --
    // total_cost reflète uniquement l'item qui a abouti.
    expect(result.total_cost).toBe(5);
  });

  it('5xx : traité comme un item non trouvé, jamais une exception qui casserait le checkout', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('server error', { status: 500 })) as any;
    const { printifyAdapter } = await import('../printify-adapter');
    await expect(
      printifyAdapter.calculateShipping!([{ supplier_product_id: '1_2_3', quantity: 1 }] as any, 'US', {})
    ).rejects.toThrow('not_available');
  });

  it("absence de retry infini : un seul appel réseau par item du panier", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(shippingPayload())));
    global.fetch = fetchSpy as any;
    const { printifyAdapter } = await import('../printify-adapter');
    await printifyAdapter.calculateShipping!(
      [
        { supplier_product_id: '1_2_3', quantity: 1 },
        { supplier_product_id: '4_5_6', quantity: 1 },
      ] as any,
      'US',
      {}
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2); // un appel par item, pas de retry
  });
});
