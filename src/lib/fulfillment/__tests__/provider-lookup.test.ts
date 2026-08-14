import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getGelatoOrderById } from '../provider-lookup';

// ============================================================
// P0-3.9.6 Gap #1A — getGelatoOrderById (GET /v4/orders/{orderId}).
// Le webhook Gelato n'est jamais une source complète d'items (structure
// items[] du payload webhook lui-même [NON DÉMONTRÉ]) : cette fonction est
// la seule source item-level fiable utilisée en enrichissement. Ces tests
// couvrent : succès avec items, 404 (found:false, jamais une erreur),
// non-2xx (throw, jamais un succès inventé), items absents/vides.
// ============================================================

const originalFetch = global.fetch;
const fetchMock = vi.fn();

beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('getGelatoOrderById', () => {
  it('retourne found:true avec les items décodés depuis itemReferenceId (P0-3.9.1, schéma OpenAPI officiel)', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        id: 'order-123',
        orderReferenceId: 'ref-abc',
        fulfillmentStatus: 'shipped',
        items: [{ itemReferenceId: 'item-1' }, { itemReferenceId: 'item-2' }],
      }),
    });

    const result = await getGelatoOrderById('order-123', 'fake-key');

    expect(result.found).toBe(true);
    expect(result.orderId).toBe('order-123');
    expect(result.orderReferenceId).toBe('ref-abc');
    expect(result.fulfillmentStatus).toBe('shipped');
    expect(result.items).toEqual([{ itemReferenceId: 'item-1' }, { itemReferenceId: 'item-2' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://order.gelatoapis.com/v4/orders/order-123',
      expect.objectContaining({ headers: { 'X-API-KEY': 'fake-key' } })
    );
  });

  it('404 -> found:false, jamais une erreur (commande non encore visible côté Gelato)', async () => {
    fetchMock.mockResolvedValue({ status: 404, ok: false });
    const result = await getGelatoOrderById('unknown-order', 'fake-key');
    expect(result).toEqual({ found: false });
  });

  it('erreur non-2xx (ex: 500) -> throw, jamais un succès inventé (Gap #1A)', async () => {
    fetchMock.mockResolvedValue({ status: 500, ok: false, text: async () => 'internal error' });
    await expect(getGelatoOrderById('order-x', 'fake-key')).rejects.toThrow('Gelato getOrder 500');
  });

  it('items absents dans la réponse -> items: [] (jamais inventés, jamais un crash)', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ id: 'order-noitems', orderReferenceId: 'ref-y', fulfillmentStatus: 'pending' }),
    });
    const result = await getGelatoOrderById('order-noitems', 'fake-key');
    expect(result.found).toBe(true);
    expect(result.items).toEqual([]);
  });

  it('filtre les items sans itemReferenceId exploitable (P0-3.9.6 Gap #1A : jamais deviné)', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        id: 'order-partial',
        items: [{ itemReferenceId: 'item-ok' }, { someOtherField: 'x' }, { itemReferenceId: '' }],
      }),
    });
    const result = await getGelatoOrderById('order-partial', 'fake-key');
    expect(result.items).toEqual([{ itemReferenceId: 'item-ok' }]);
  });
});
