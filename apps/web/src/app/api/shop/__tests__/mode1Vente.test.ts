// src/app/api/shop/__tests__/mode1Vente.test.ts
//
// PHASE M1-5 — admission commerciale sur les portes de VENTE.
//
// Ces trois routes sont PUBLIQUES : un acheteur n'est pas authentifie. La
// propriete du site n'est donc pas la protection attendue — la frontiere est
// `slug -> sites.mode -> canTransact()`.
//
// La variable isolee est `sites.mode`, et elle seule : le site est toujours
// trouve, le compte de paiement toujours present, les produits toujours la.
// Un refus ne peut donc venir que de la frontiere.
//
// Le cas le plus important est `checkout` avec `payment_account_id` RENSEIGNE :
// il prouve que la garde ne se confond pas avec l'absence de compte Stripe.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const SITE = { id: 'site-1', mode: 1 as unknown, payment_provider: 'stripe', payment_account_id: 'acct_1', shipping_flat: 5, cj_margin_percent: null, cj_round_mode: null, dropship_type: null, pod_designs: null };

const fromMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])), rpc: vi.fn() },
}));
const createCheckoutMock = vi.fn();
vi.mock('@/lib/payments', () => ({ getProvider: () => ({ createCheckout: (...a: unknown[]) => createCheckoutMock(...a) }) }));
const checkStockMock = vi.fn();
vi.mock('@/lib/shop', () => ({ checkStock: (...a: unknown[]) => checkStockMock(...a), decrementStock: vi.fn() }));
vi.mock('@/lib/mode3/catalogStock', () => ({ checkCatalogStock: vi.fn(async () => ({ ok: true })) }));
const buildSupplierGroupsMock = vi.fn();
const resolveShippingMock = vi.fn();
vi.mock('@/lib/shop/quote/resolveShipping', () => ({
  buildSupplierGroups: (...a: unknown[]) => buildSupplierGroupsMock(...a),
  resolveShipping: (...a: unknown[]) => resolveShippingMock(...a),
}));
vi.mock('@/lib/anomaly', () => ({ logAnomaly: vi.fn() }));
vi.mock('@/lib/suppliers/registry', () => ({ suppliersWithCapability: () => [] }));

import { POST as checkoutPOST } from '../checkout/route';
import { POST as calculatePOST } from '../shipping/calculate/route';

function chain(data: unknown) {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const m of ['select', 'eq', 'in', 'is', 'insert', 'update']) c[m] = vi.fn(self);
  c.single = vi.fn(async () => ({ data, error: null }));
  c.maybeSingle = vi.fn(async () => ({ data, error: null }));
  c.then = (r: (v: unknown) => void) => r({ data: Array.isArray(data) ? data : [data], error: null });
  return c;
}
const req = (b: unknown) => new Request('https://woorri.test/api', { method: 'POST', body: JSON.stringify(b) });

beforeEach(() => {
  fromMock.mockReset().mockImplementation((t: string) => chain(t === 'sites' ? SITE : { id: 'x' }));
  createCheckoutMock.mockReset().mockResolvedValue({ url: 'u', orderId: 'o' });
  checkStockMock.mockReset().mockResolvedValue({ ok: true });
  buildSupplierGroupsMock.mockReset().mockResolvedValue({});
  resolveShippingMock.mockReset().mockResolvedValue({ source: 'flat', amount: 5, tiers: null, selectedTier: null, logisticName: null, estimatedMinDays: null, estimatedMaxDays: null });
});

const PORTES: [string, () => Promise<Response>][] = [
  ['POST shop/checkout', () => checkoutPOST(req({ slug: 'b', items: [{ id: 'p1', quantity: 1 }] }) as never)],
  ['POST shop/shipping/calculate', () => calculatePOST(req({ slug: 'b', items: [{ id: 'p1', quantity: 1 }], countryCode: 'US' }) as never)],
];

describe('M1-5 — Mode 1 refusé sur les portes de vente', () => {
  it.each(PORTES)('%s : mode 1 -> 403', async (_n, appel) => {
    SITE.mode = 1;
    expect((await appel()).status).toBe(403);
  });

  it('checkout : refusé MÊME avec un compte de paiement connecté', async () => {
    SITE.mode = 1;
    expect(SITE.payment_account_id, 'le compte est present : le refus ne peut pas venir de son absence').toBeTruthy();
    const res = await checkoutPOST(req({ slug: 'b', items: [{ id: 'p1', quantity: 1 }] }) as never);
    expect(res.status).toBe(403);
  });

  it('checkout : mode 1 -> AUCUNE session Stripe, AUCUNE écriture', async () => {
    SITE.mode = 1;
    await checkoutPOST(req({ slug: 'b', items: [{ id: 'p1', quantity: 1 }] }) as never);
    expect(createCheckoutMock, 'aucune session de paiement ne doit exister').not.toHaveBeenCalled();
    expect(checkStockMock, 'aucune lecture commerciale au-delà de la garde').not.toHaveBeenCalled();
  });

  it('shipping/calculate : mode 1 -> AUCUN calcul, AUCUN appel fournisseur', async () => {
    SITE.mode = 1;
    await calculatePOST(req({ slug: 'b', items: [{ id: 'p1', quantity: 1 }], countryCode: 'US' }) as never);
    expect(buildSupplierGroupsMock).not.toHaveBeenCalled();
    expect(resolveShippingMock).not.toHaveBeenCalled();
  });
});

describe('M1-5 — l’ORDRE de la garde est lui-même une propriété', () => {
  // Sans ce cas, deplacer la garde APRES le controle `payment_account_id`
  // passerait inapercu : tous les autres fixtures ont un compte renseigne.
  // Ici le compte est ABSENT et le mode vaut 1 — les deux refus sont possibles,
  // et seul le bon ordre rend 403 plutot que 400.
  it('vitrine SANS compte de paiement : 403 (mode), jamais 400 (donnee absente)', async () => {
    SITE.mode = 1;
    const sauv = SITE.payment_account_id;
    (SITE as { payment_account_id: unknown }).payment_account_id = null;
    const res = await checkoutPOST(req({ slug: 'b', items: [{ id: 'p1', quantity: 1 }] }) as never);
    (SITE as { payment_account_id: unknown }).payment_account_id = sauv;
    expect(
      res.status,
      "la frontiere d'admission doit preceder toute barriere incidente : un 400 signifierait que l'absence de compte a decide a la place du mode"
    ).toBe(403);
  });
});

describe('M1-5 — les modes commerçants restent autorisés', () => {
  it.each(PORTES)('%s : mode 2 -> jamais 403', async (_n, appel) => {
    SITE.mode = 2;
    expect((await appel()).status).not.toBe(403);
  });
  it.each(PORTES)('%s : mode 3 -> jamais 403', async (_n, appel) => {
    SITE.mode = 3;
    expect((await appel()).status).not.toBe(403);
  });
});

describe('M1-5 — fail-closed', () => {
  it.each(PORTES)('%s : mode null -> 403', async (_n, appel) => { SITE.mode = null; expect((await appel()).status).toBe(403); });
  it.each(PORTES)('%s : mode 4 -> 403', async (_n, appel) => { SITE.mode = 4; expect((await appel()).status).toBe(403); });
});
