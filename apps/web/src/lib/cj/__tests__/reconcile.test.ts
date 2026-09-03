import { describe, it, expect, vi, beforeEach } from 'vitest';

const cjGetOrderDetailMock = vi.fn();
vi.mock('../client', () => ({
  cjGetOrderDetail: (...a: unknown[]) => cjGetOrderDetailMock(...a),
}));

import { reconcileWithCj } from '../reconcile';

// Audit Reseller/CJ §3-4 : reconcileWithCj est le seul point de traduction
// entre le contrat cjGetOrderDetail (found/not_found/unknown) et les 6
// résultats métier. Couvre explicitement la distinction NOT_FOUND vs UNKNOWN
// (jamais confondus) exigée par la conception.

beforeEach(() => {
  cjGetOrderDetailMock.mockReset();
});

describe('reconcileWithCj', () => {
  it('not_found confirmé (1600300) -> NOT_FOUND', async () => {
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'not_found' });
    const r = await reconcileWithCj('e', 'k', 'order-1');
    expect(r).toEqual({ kind: 'NOT_FOUND' });
  });

  it('unknown (timeout/429/5xx) -> UNKNOWN avec la raison, jamais NOT_FOUND', async () => {
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'unknown', reason: 'Too Many Requests' });
    const r = await reconcileWithCj('e', 'k', 'order-1');
    expect(r).toEqual({ kind: 'UNKNOWN', reason: 'Too Many Requests' });
  });

  it('found + SHIPPED -> FOUND_PAID', async () => {
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: { orderId: 'cj-1', orderStatus: 'SHIPPED' } });
    const r = await reconcileWithCj('e', 'k', 'order-1');
    expect(r.kind).toBe('FOUND_PAID');
    expect((r as any).cjOrderId).toBe('cj-1');
  });

  it('found + PENDING (sous-statut UNSHIPPED) -> FOUND_PAID, pas awaiting', async () => {
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: { orderId: 'cj-1', orderStatus: 'PENDING' } });
    const r = await reconcileWithCj('e', 'k', 'order-1');
    expect(r.kind).toBe('FOUND_PAID');
  });

  it('found + UNPAID -> FOUND_AWAITING', async () => {
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: { orderId: 'cj-1', orderStatus: 'UNPAID' } });
    const r = await reconcileWithCj('e', 'k', 'order-1');
    expect(r.kind).toBe('FOUND_AWAITING');
  });

  it('found + CANCELLED -> FOUND_TERMINAL', async () => {
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: { orderId: 'cj-1', orderStatus: 'CANCELLED' } });
    const r = await reconcileWithCj('e', 'k', 'order-1');
    expect(r.kind).toBe('FOUND_TERMINAL');
  });

  it('found + TRASH (observé réel, non documenté) -> FOUND_TERMINAL, pas de recréation implicite', async () => {
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: { orderId: 'cj-1', orderStatus: 'TRASH' } });
    const r = await reconcileWithCj('e', 'k', 'order-1');
    expect(r.kind).toBe('FOUND_TERMINAL');
  });

  it('found + statut non reconnu -> FOUND_UNRECOGNIZED, jamais paid/awaiting par défaut', async () => {
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: { orderId: 'cj-1', orderStatus: 'WEIRD' } });
    const r = await reconcileWithCj('e', 'k', 'order-1');
    expect(r.kind).toBe('FOUND_UNRECOGNIZED');
  });

  it('found via cjOrderId (fallback quand orderId absent)', async () => {
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: { cjOrderId: 'cj-2', orderStatus: 'SHIPPED' } });
    const r = await reconcileWithCj('e', 'k', 'order-1');
    expect((r as any).cjOrderId).toBe('cj-2');
  });

  it('found sans aucun identifiant exploitable -> UNKNOWN, jamais classé comme un état réel', async () => {
    cjGetOrderDetailMock.mockResolvedValue({ outcome: 'found', data: { orderStatus: 'SHIPPED' } });
    const r = await reconcileWithCj('e', 'k', 'order-1');
    expect(r).toEqual({ kind: 'UNKNOWN', reason: 'found_without_order_id' });
  });
});
