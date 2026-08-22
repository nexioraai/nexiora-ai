import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Audit Reseller/CJ (Mode 3) -- aucune couverture avant cet audit.
// Verrouille : idempotence (verrou atomique), réconciliation-avant-création
// (jamais l'inverse), distinction NOT_FOUND/FOUND/UNKNOWN, gestion 1603003
// (récupération, pas un échec), CANCELLED/TRASH (jamais de recréation
// automatique), UNKNOWN_STATUS (blocage sûr), exhaustion des tentatives,
// reprise d'un verrou abandonné (crash recovery), alerting complet.
//
// Audit API Points (Findings 1-2) : le verrou est désormais acquis AVANT la
// résolution produit/variante -- séquence réelle testée ici : order -> items
// -> claim (ou reprise stale) -> résolution shop/catalog -> adresse -> fret
// -> réconciliation -> création. Toute la suite ci-dessous reflète cet ordre.
//
// L'atomicité du verrou lui-même (UPDATE...WHERE sous 8 appels concurrents
// réels) a été revalidée séparément en conditions réelles contre une ligne
// shop_orders jetable (aucun appel CJ impliqué) -- exactement 1 gagnant sur
// 8, cf. rapports finaux. Les tests ci-dessous couvrent la LOGIQUE autour de
// ce verrou (deterministe, via mocks), pas l'atomicité elle-même (déjà
// prouvée en réel, non-déterministe par nature).
// ============================================================

vi.hoisted(() => {
  process.env.CJ_EMAIL = 'nexiora@test.com';
  process.env.CJ_API_KEY = 'test-key';
});

const cjCalculateFreightMock = vi.fn();
const cjCreateOrderMock = vi.fn();
const cjGetVariantsMock = vi.fn();
vi.mock('../client', async () => {
  const actual = await vi.importActual<typeof import('../client')>('../client');
  return {
    ...actual,
    cjCalculateFreight: (...a: unknown[]) => cjCalculateFreightMock(...a),
    cjCreateOrder: (...a: unknown[]) => cjCreateOrderMock(...a),
    cjGetVariants: (...a: unknown[]) => cjGetVariantsMock(...a),
  };
});

const reconcileWithCjMock = vi.fn();
vi.mock('../reconcile', () => ({
  reconcileWithCj: (...a: unknown[]) => reconcileWithCjMock(...a),
}));

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({
  logAnomaly: (...a: unknown[]) => logAnomalyMock(...a),
}));

const { fromMock, updateCalls } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  updateCalls: [] as { table: string; payload: Record<string, unknown> }[],
}));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

import { fulfillCjOrder, MAX_CREATE_ATTEMPTS } from '../fulfill';
import { CjApiError } from '../client';

function chainFor(table: string, response: { data: unknown; error?: unknown } = { data: null, error: null }) {
  const chain: any = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.update = vi.fn((payload: Record<string, unknown>) => {
    updateCalls.push({ table, payload });
    return chain;
  });
  chain.eq = vi.fn(self);
  chain.in = vi.fn(self);
  chain.or = vi.fn(self);
  chain.lt = vi.fn(self);
  chain.maybeSingle = vi.fn(async () => response);
  chain.single = vi.fn(async () => response);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const ORDER = {
  id: 'order-1',
  site_id: 'site-1',
  shipping_address: { country: 'US', city: 'NYC', postal_code: '10001', line1: '123 Main St', state: 'NY', phone: '+15550001111' },
  customer_name: 'Client',
  customer_email: 'c@test.com',
  cj_pay_status: 'pending',
  cj_pay_attempts: 0,
  cj_pay_locked_at: null,
  shipping_amount: 10,
  shipment_logistic_name: null,
  total: 50,
};
const ITEMS = [{ product_id: 'sp1', quantity: 1 }];
const PRODUCTS = [{ id: 'sp1', cj_vid: 'vid-1' }];
const CATALOG_ITEMS = [{ product_id: 'catalog-p1', quantity: 1 }, { product_id: 'catalog-p2', quantity: 1 }];
const CATALOG_PRODUCTS = [{ id: 'p1', supplier_product_id: 'sp-p1' }, { id: 'p2', supplier_product_id: 'sp-p2' }];

function queueOrderSelect(overrides: Record<string, unknown> = {}) {
  fromMock.mockImplementationOnce(() => chainFor('shop_orders', { data: { ...ORDER, ...overrides }, error: null }));
}
function queueItemsSelect(items: unknown = ITEMS) {
  fromMock.mockImplementationOnce(() => chainFor('shop_order_items', { data: items, error: null }));
}
function queueClaim(won: boolean) {
  fromMock.mockImplementationOnce(() => chainFor('shop_orders', { data: won ? [{ id: ORDER.id }] : [], error: null }));
}
function queueStaleReclaim(won: boolean) {
  fromMock.mockImplementationOnce(() => chainFor('shop_orders', { data: won ? [{ id: ORDER.id }] : [], error: null }));
}
function queueShopProducts(products: unknown = PRODUCTS) {
  fromMock.mockImplementationOnce(() => chainFor('shop_products', { data: products, error: null }));
}
function queueCatalogProducts(products: unknown = CATALOG_PRODUCTS) {
  fromMock.mockImplementationOnce(() => chainFor('catalog_products', { data: products, error: null }));
}
function queueWrite() {
  fromMock.mockImplementationOnce(() => chainFor('shop_orders', { data: null, error: null }));
}
function queueExhaustWrite(matched: boolean) {
  fromMock.mockImplementationOnce(() => chainFor('shop_orders', { data: matched ? [{ id: ORDER.id }] : [], error: null }));
}

/** Séquence standard : order -> items (shop) -> claim(true) -> shop_products. */
function queueStandardClaimedSetup(orderOverrides: Record<string, unknown> = {}, items: unknown = ITEMS, products: unknown = PRODUCTS) {
  queueOrderSelect(orderOverrides);
  queueItemsSelect(items);
  queueClaim(true);
  queueShopProducts(products);
}

beforeEach(() => {
  fromMock.mockReset();
  updateCalls.length = 0;
  cjCalculateFreightMock.mockReset();
  cjCreateOrderMock.mockReset();
  cjGetVariantsMock.mockReset();
  reconcileWithCjMock.mockReset();
  logAnomalyMock.mockReset();
  cjCalculateFreightMock.mockResolvedValue([{ logisticName: 'Standard', logisticPrice: '5' }]);
});

describe('fulfillCjOrder — état déjà résolu : sortie immédiate', () => {
  it.each(['paid', 'awaiting_manual_payment', 'blocked_terminal', 'blocked_unknown', 'canceled'])(
    'cj_pay_status=%s -> aucun appel supplémentaire, jamais écrasé',
    async (status) => {
      queueOrderSelect({ cj_pay_status: status });
      const result = await fulfillCjOrder('order-1');
      expect(result).toEqual([]);
      expect(fromMock).toHaveBeenCalledTimes(1);
      expect(cjCalculateFreightMock).not.toHaveBeenCalled();
    }
  );
});

describe('fulfillCjOrder — épuisement pré-existant', () => {
  it('attempts >= MAX et status pas encore failed -> markExhausted, aucun appel CJ', async () => {
    queueOrderSelect({ cj_pay_attempts: MAX_CREATE_ATTEMPTS, cj_pay_status: 'pending' });
    queueExhaustWrite(true);
    const result = await fulfillCjOrder('order-1');
    expect(result).toEqual([]);
    expect(cjCalculateFreightMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_fulfill_exhausted', severity: 'blocked' })
    );
  });
});

describe('fulfillCjOrder — résolution produit/variante (audit API Points, Finding 2)', () => {
  it('produit shop sans cj_vid -> failed + cj_product_resolution_failed immédiatement (aucune preuve transitoire)', async () => {
    queueOrderSelect();
    queueItemsSelect();
    queueClaim(true);
    queueShopProducts([{ id: 'sp1', cj_vid: null }]);
    queueWrite();
    const result = await fulfillCjOrder('order-1');
    expect(result).toEqual([]);
    expect(cjCalculateFreightMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cj_product_resolution_failed',
        severity: 'blocked',
        details: expect.objectContaining({ retrying: false }),
      })
    );
    const write = updateCalls.find((c) => (c.payload as any).cj_pay_status === 'failed');
    expect(write).toBeTruthy();
  });

  it('cjGetVariants rate-limité (429/QPS/API Points), première tentative -> pending + info, PAS d\'alerte email, retryable', async () => {
    queueOrderSelect();
    queueItemsSelect(CATALOG_ITEMS);
    queueClaim(true);
    queueCatalogProducts();
    cjGetVariantsMock.mockRejectedValue(new CjApiError('Insufficient API points. Used today: 50000, Remaining: 0, Required: 10', null, 429));
    queueWrite();
    const result = await fulfillCjOrder('order-1');
    expect(result).toEqual([]);
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cj_product_resolution_failed',
        severity: 'info',
        details: expect.objectContaining({ retrying: true }),
      })
    );
    const write = updateCalls.find((c) => (c.payload as any).cj_pay_status === 'pending');
    expect(write).toBeTruthy();
  });

  it('cjGetVariants échec permanent (pid introuvable côté CJ) -> failed + alerte blocked immédiatement', async () => {
    queueOrderSelect();
    queueItemsSelect(CATALOG_ITEMS);
    queueClaim(true);
    queueCatalogProducts();
    cjGetVariantsMock.mockRejectedValue(new Error('Erreur API CJ : pid not found'));
    queueWrite();
    const result = await fulfillCjOrder('order-1');
    expect(result).toEqual([]);
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_product_resolution_failed', severity: 'blocked' })
    );
  });

  it('rate-limité mais reprise d\'un verrou déjà stale (2e tentative) -> escalade blocked, n\'attend plus indéfiniment', async () => {
    queueOrderSelect();
    queueItemsSelect(CATALOG_ITEMS);
    queueClaim(false);
    queueStaleReclaim(true);
    queueCatalogProducts();
    cjGetVariantsMock.mockRejectedValue(new CjApiError('Too Many Requests, QPS limit is 1 time/1second', null, 429));
    queueWrite();
    const result = await fulfillCjOrder('order-1');
    expect(result).toEqual([]);
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cj_product_resolution_failed',
        severity: 'blocked',
        details: expect.objectContaining({ persistent: true }),
      })
    );
  });
});

describe('fulfillCjOrder — adresse incomplète', () => {
  it('champ manquant -> failed + cj_address_incomplete, jamais silencieux', async () => {
    queueStandardClaimedSetup({ shipping_address: { country: 'US' } }); // ville/code postal/ligne1 manquants
    queueWrite();
    const result = await fulfillCjOrder('order-1');
    expect(result).toEqual([]);
    expect(cjCalculateFreightMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_address_incomplete', severity: 'blocked' })
    );
  });
});

describe('fulfillCjOrder — province/état : validation par pays (audit rate-limit + adresse)', () => {
  it('US sans state -> cj_address_incomplete (pays où la province est nécessaire à la livraison)', async () => {
    queueStandardClaimedSetup({ shipping_address: { country: 'US', city: 'NYC', postal_code: '10001', line1: '123 Main St' } });
    queueWrite();
    await fulfillCjOrder('order-1');
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_address_incomplete', details: expect.objectContaining({ missing: expect.arrayContaining(['state']) }) })
    );
  });

  it('pays sans concept de province (ex: SG) sans state -> PAS bloqué, ne devine jamais une exigence non prouvée', async () => {
    queueStandardClaimedSetup({ shipping_address: { country: 'SG', city: 'Singapore', postal_code: '018956', line1: '1 Marina Blvd' } });
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCreateOrderMock.mockResolvedValue({ orderId: 'cj-sg' });
    queueWrite();
    const result = await fulfillCjOrder('order-1');
    expect(logAnomalyMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'cj_address_incomplete' }));
    expect(result).toEqual(['vid-1']);
  });
});

describe('fulfillCjOrder — téléphone (audit adresse, partie 7)', () => {
  it('téléphone absent -> shippingPhone envoyé vide, jamais le placeholder fabriqué', async () => {
    queueStandardClaimedSetup({ shipping_address: { country: 'SG', city: 'Singapore', postal_code: '018956', line1: '1 Marina Blvd' } });
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCreateOrderMock.mockResolvedValue({ orderId: 'cj-1' });
    queueWrite();
    await fulfillCjOrder('order-1');
    const sentOrder = cjCreateOrderMock.mock.calls[0][2];
    expect(sentOrder.shippingPhone).toBe('');
    expect(sentOrder.shippingPhone).not.toBe('0000000000');
  });

  it('téléphone présent (collecté par Stripe) -> transmis tel quel à CJ', async () => {
    queueStandardClaimedSetup(); // fixture par defaut : state='NY', phone='+15550001111'
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCreateOrderMock.mockResolvedValue({ orderId: 'cj-1' });
    queueWrite();
    await fulfillCjOrder('order-1');
    const sentOrder = cjCreateOrderMock.mock.calls[0][2];
    expect(sentOrder.shippingPhone).toBe('+15550001111');
  });
});

describe('fulfillCjOrder — rate-limit CJ (QPS + API Points, audit hostile + audit API Points)', () => {
  it('429 QPS sur createOrderV2 -> PAS de décrément de tentative, pending, info (jamais cj_fulfill_exhausted)', async () => {
    queueStandardClaimedSetup({ cj_pay_attempts: 0 });
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCreateOrderMock.mockRejectedValue(new CjApiError('Too Many Requests, QPS limit is 1 time/1second', null));
    queueWrite();
    await fulfillCjOrder('order-1');
    const write = updateCalls.find((c) => (c.payload as any).cj_pay_status === 'pending');
    expect(write?.payload).not.toHaveProperty('cj_pay_attempts');
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_create_failed_retrying', severity: 'info', details: expect.objectContaining({ rateLimited: true, rateLimitKind: 'qps' }) })
    );
    expect(logAnomalyMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'cj_fulfill_exhausted' }));
  });

  it('429 "Insufficient API points" -> reconnu comme rate-limit (PAS comme permanent malgré "insufficient"), pas de décrément', async () => {
    queueStandardClaimedSetup({ cj_pay_attempts: 0 });
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCreateOrderMock.mockRejectedValue(new CjApiError('Insufficient API points. Used today: 50000, Remaining: 0, Required: 10', null, 429));
    queueWrite();
    await fulfillCjOrder('order-1');
    const write = updateCalls.find((c) => (c.payload as any).cj_pay_status === 'pending');
    expect(write?.payload).not.toHaveProperty('cj_pay_attempts');
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ rateLimited: true, rateLimitKind: 'api_points' }) })
    );
    expect(logAnomalyMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'cj_fulfill_exhausted' }));
  });

  it('"insufficient balance" (garde-fou payType 2 historique) -> reste classifié permanent, PAS confondu avec API Points', async () => {
    queueStandardClaimedSetup({ cj_pay_attempts: 0 });
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCreateOrderMock.mockRejectedValue(new Error('Erreur API CJ : insufficient balance'));
    queueWrite();
    await fulfillCjOrder('order-1');
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_fulfill_exhausted', severity: 'blocked', details: expect.objectContaining({ permanent: true }) })
    );
  });

  it('429 même au 3e essai -> toujours PAS d\'épuisement (le rate-limit n\'use jamais le budget, quel que soit le compteur actuel)', async () => {
    queueStandardClaimedSetup({ cj_pay_attempts: MAX_CREATE_ATTEMPTS - 1 });
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCreateOrderMock.mockRejectedValue(new CjApiError('Too Many Requests, QPS limit is 1 time/1second', null));
    queueWrite();
    await fulfillCjOrder('order-1');
    expect(logAnomalyMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'cj_fulfill_exhausted' }));
  });

  it('boucle catalogue (cjGetVariants) reste fonctionnelle avec plusieurs produits, throttle désormais centralisé', async () => {
    queueOrderSelect({ shipping_address: { country: 'SG', city: 'Singapore', postal_code: '018956', line1: '1 Marina Blvd' } });
    queueItemsSelect(CATALOG_ITEMS);
    queueClaim(true);
    queueCatalogProducts();
    cjGetVariantsMock.mockResolvedValue([{ vid: 'vid-catalog' }]);
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCreateOrderMock.mockResolvedValue({ orderId: 'cj-1' });
    queueWrite();
    await fulfillCjOrder('order-1');
    // Le throttle lui-meme est desormais centralise dans cjFetch/rateLimiter.ts
    // (couvre tout appel CJ, teste separement dans rateLimiter.test.ts) --
    // ici on verifie uniquement que la boucle catalogue reste fonctionnelle
    // (les DEUX produits sont bien resolus, cjCalculateFreight suit).
    expect(cjGetVariantsMock).toHaveBeenCalledTimes(2);
    expect(cjCalculateFreightMock).toHaveBeenCalledTimes(1);
  });
});

describe('fulfillCjOrder — garde-fou coût réel > encaissé', () => {
  it('bloque et alerte, comportement existant préservé', async () => {
    queueStandardClaimedSetup({ shipping_amount: 1 });
    cjCalculateFreightMock.mockResolvedValue([{ logisticName: 'Standard', logisticPrice: '99' }]);
    queueWrite();
    const result = await fulfillCjOrder('order-1');
    expect(result).toEqual([]);
    expect(cjCreateOrderMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_shipping_cost_exceeds_charged', severity: 'blocked' })
    );
  });
});

describe('fulfillCjOrder — idempotence : verrou perdu', () => {
  it('claim frais échoue + reprise stale échoue -> retour propre, aucune résolution produit/réconciliation/création', async () => {
    queueOrderSelect();
    queueItemsSelect();
    queueClaim(false);
    queueStaleReclaim(false);
    const result = await fulfillCjOrder('order-1');
    expect(result).toEqual([]);
    expect(cjGetVariantsMock).not.toHaveBeenCalled();
    expect(reconcileWithCjMock).not.toHaveBeenCalled();
    expect(cjCreateOrderMock).not.toHaveBeenCalled();
  });
});

describe('fulfillCjOrder — crash recovery : verrou abandonné', () => {
  it('claim frais échoue + reprise stale réussit -> résolution produit puis réconciliation tentées', async () => {
    queueOrderSelect();
    queueItemsSelect();
    queueClaim(false);
    queueStaleReclaim(true);
    queueShopProducts();
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCreateOrderMock.mockResolvedValue({ orderId: 'cj-1' });
    queueWrite();
    await fulfillCjOrder('order-1');
    expect(reconcileWithCjMock).toHaveBeenCalledWith('nexiora@test.com', 'test-key', 'order-1');
  });
});

describe('fulfillCjOrder — NOT_FOUND -> création autorisée', () => {
  it('réconciliation NOT_FOUND puis création réussie -> awaiting_manual_payment + alerte', async () => {
    queueStandardClaimedSetup();
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCreateOrderMock.mockResolvedValue({ orderId: 'cj-order-1' });
    queueWrite();
    const result = await fulfillCjOrder('order-1');
    expect(result).toEqual(['vid-1']);
    expect(cjCreateOrderMock).toHaveBeenCalledTimes(1);
    const write = updateCalls.find((c) => (c.payload as any).cj_pay_status === 'awaiting_manual_payment');
    expect(write?.payload).toMatchObject({ cj_order_id: 'cj-order-1', cj_pay_attempts: 1 });
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_awaiting_manual_payment', severity: 'warning' })
    );
  });
});

describe('fulfillCjOrder — FOUND avant création : aucune nouvelle commande CJ', () => {
  it('FOUND_PAID -> paid, createOrderV2 jamais appelé', async () => {
    queueStandardClaimedSetup();
    reconcileWithCjMock.mockResolvedValue({ kind: 'FOUND_PAID', cjOrderId: 'cj-existing', raw: {} });
    queueWrite();
    await fulfillCjOrder('order-1');
    expect(cjCreateOrderMock).not.toHaveBeenCalled();
    const write = updateCalls.find((c) => (c.payload as any).cj_pay_status === 'paid');
    expect(write?.payload).toMatchObject({ cj_order_id: 'cj-existing' });
  });

  it('FOUND_AWAITING -> awaiting_manual_payment + alerte (corrige la régression historique : jamais silencieux)', async () => {
    queueStandardClaimedSetup();
    reconcileWithCjMock.mockResolvedValue({ kind: 'FOUND_AWAITING', cjOrderId: 'cj-existing', raw: {} });
    queueWrite();
    await fulfillCjOrder('order-1');
    expect(cjCreateOrderMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_awaiting_manual_payment', severity: 'warning' })
    );
  });

  it('FOUND_TERMINAL (CANCELLED/TRASH) -> blocked_terminal + alerte, jamais de recréation automatique', async () => {
    queueStandardClaimedSetup();
    reconcileWithCjMock.mockResolvedValue({ kind: 'FOUND_TERMINAL', cjOrderId: 'cj-existing', raw: { orderStatus: 'TRASH' } });
    queueWrite();
    await fulfillCjOrder('order-1');
    expect(cjCreateOrderMock).not.toHaveBeenCalled();
    const write = updateCalls.find((c) => (c.payload as any).cj_pay_status === 'blocked_terminal');
    expect(write).toBeTruthy();
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_terminal_order_blocked', severity: 'blocked' })
    );
  });

  it('FOUND_UNRECOGNIZED -> blocked_unknown + alerte, jamais deviné', async () => {
    queueStandardClaimedSetup();
    reconcileWithCjMock.mockResolvedValue({ kind: 'FOUND_UNRECOGNIZED', cjOrderId: 'cj-existing', raw: { orderStatus: 'WEIRD' } });
    queueWrite();
    await fulfillCjOrder('order-1');
    expect(cjCreateOrderMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_reconciliation_unknown', severity: 'blocked' })
    );
  });
});

describe('fulfillCjOrder — UNKNOWN (timeout/429/5xx) : jamais traité comme absence', () => {
  it('première occurrence -> reste processing, trace info, PAS de création, PAS d\'email immédiat', async () => {
    queueStandardClaimedSetup();
    reconcileWithCjMock.mockResolvedValue({ kind: 'UNKNOWN', reason: 'timeout' });
    const result = await fulfillCjOrder('order-1');
    // Retourne les vids concernés (contrat préservé), pas un signal succès/échec --
    // la garantie testée est l'ABSENCE de création, pas la valeur de retour.
    expect(result).toEqual(['vid-1']);
    expect(cjCreateOrderMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_reconciliation_unknown', severity: 'info' })
    );
  });

  it('occurrence après reprise d\'un verrou stale -> escalade blocked_unknown + alerte blocked (n\'attend plus indéfiniment)', async () => {
    queueOrderSelect();
    queueItemsSelect();
    queueClaim(false);
    queueStaleReclaim(true);
    queueShopProducts();
    reconcileWithCjMock.mockResolvedValue({ kind: 'UNKNOWN', reason: 'timeout' });
    queueWrite();
    await fulfillCjOrder('order-1');
    expect(cjCreateOrderMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_reconciliation_unknown', severity: 'blocked' })
    );
  });
});

describe('fulfillCjOrder — 1603003 : preuve de récupération, jamais un échec', () => {
  function throwDuplicate() {
    return Promise.reject(new CjApiError('Order exist, please do not duplicate create', 1603003));
  }

  it('1603003 -> reconciliation -> FOUND_AWAITING : récupéré, PAS de décrément de tentative comptabilisé comme échec, PAS de cj_fulfill_exhausted', async () => {
    queueStandardClaimedSetup();
    reconcileWithCjMock
      .mockResolvedValueOnce({ kind: 'NOT_FOUND' }) // avant création
      .mockResolvedValueOnce({ kind: 'FOUND_AWAITING', cjOrderId: 'cj-recovered', raw: {} }); // après 1603003
    cjCreateOrderMock.mockImplementation(throwDuplicate);
    queueWrite();
    const result = await fulfillCjOrder('order-1');
    expect(result).toEqual(['vid-1']);
    expect(logAnomalyMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'cj_fulfill_exhausted' }));
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_awaiting_manual_payment' })
    );
  });

  it('1603003 -> reconciliation -> NOT_FOUND : contradiction externe traitée, jamais recréé en boucle', async () => {
    queueStandardClaimedSetup();
    reconcileWithCjMock
      .mockResolvedValueOnce({ kind: 'NOT_FOUND' })
      .mockResolvedValueOnce({ kind: 'NOT_FOUND' }); // contradiction : CJ dit "existe" puis "n'existe pas"
    cjCreateOrderMock.mockImplementation(throwDuplicate);
    queueWrite();
    const result = await fulfillCjOrder('order-1');
    expect(result).toEqual([]);
    expect(cjCreateOrderMock).toHaveBeenCalledTimes(1); // jamais retenté dans la même passe
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_reconciliation_unknown', details: expect.objectContaining({ reason: 'post_duplicate_contradiction' }) })
    );
  });

  it('1603003 -> reconciliation -> UNKNOWN : ne recrée pas, escalade immédiatement (situation plus grave qu\'un premier essai)', async () => {
    queueStandardClaimedSetup();
    reconcileWithCjMock
      .mockResolvedValueOnce({ kind: 'NOT_FOUND' })
      .mockResolvedValueOnce({ kind: 'UNKNOWN', reason: '5xx' });
    cjCreateOrderMock.mockImplementation(throwDuplicate);
    queueWrite();
    const result = await fulfillCjOrder('order-1');
    expect(result).toEqual(['vid-1']);
    expect(cjCreateOrderMock).toHaveBeenCalledTimes(1);
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_reconciliation_unknown', severity: 'blocked' })
    );
  });
});

describe('fulfillCjOrder — échecs de création (non-1603003)', () => {
  it('erreur transitoire, budget restant -> pending, attempts incrémenté (SEULEMENT ici, pas au claim), info seulement', async () => {
    queueStandardClaimedSetup({ cj_pay_attempts: 0 });
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCreateOrderMock.mockRejectedValue(new Error('CJ 500: internal error'));
    queueWrite();
    await fulfillCjOrder('order-1');
    const write = updateCalls.find((c) => (c.payload as any).cj_pay_status === 'pending');
    expect(write?.payload).toMatchObject({ cj_pay_attempts: 1 });
    // Le claim (premier update) ne doit JAMAIS porter cj_pay_attempts -- decouple (audit §10/§14).
    const claimWrite = updateCalls.find((c) => (c.payload as any).cj_pay_status === 'processing');
    expect(claimWrite?.payload).not.toHaveProperty('cj_pay_attempts');
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_create_failed_retrying', severity: 'info' })
    );
  });

  it('erreur transitoire au dernier essai (attempts atteint MAX) -> failed + cj_fulfill_exhausted (blocked)', async () => {
    queueStandardClaimedSetup({ cj_pay_attempts: MAX_CREATE_ATTEMPTS - 1 });
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCreateOrderMock.mockRejectedValue(new Error('CJ 500: internal error'));
    queueWrite();
    await fulfillCjOrder('order-1');
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_fulfill_exhausted', severity: 'blocked' })
    );
  });

  it('erreur permanente (paramètre invalide) -> failed + cj_fulfill_exhausted immédiatement, quel que soit le budget restant', async () => {
    queueStandardClaimedSetup({ cj_pay_attempts: 0 });
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCreateOrderMock.mockRejectedValue(new Error('Erreur API CJ : invalid param shippingZip'));
    queueWrite();
    await fulfillCjOrder('order-1');
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cj_fulfill_exhausted', severity: 'blocked', details: expect.objectContaining({ permanent: true }) })
    );
  });
});
