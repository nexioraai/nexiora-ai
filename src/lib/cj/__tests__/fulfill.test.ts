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

import { fulfillCjOrder, MAX_CREATE_ATTEMPTS, parsePromisedMaxDays } from '../fulfill';
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
  // Commande NOMINALE : une methode a ete enregistree et un delai a ete
  // communique a l'acheteur. La fixture portait auparavant `null` sur les deux,
  // ce qui ne modelisait aucune commande reelle -- et qu'aucun test n'exercait,
  // le fulfillment ne lisant alors ni l'un ni l'autre.
  shipment_logistic_name: 'Standard',
  estimated_delivery: '12 days',
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
  // CJ renvoie logisticAging sur cet endpoint : le cron shipping-cache appelle
  // la MEME fonction et en derive days_min/days_max via parseAging.
  cjCalculateFreightMock.mockResolvedValue([{ logisticName: 'Standard', logisticPrice: '5', logisticAging: '7-12' }]);
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
    // La reconciliation precede desormais toute decision terminale : ce refus
    // ne peut plus etre prononce sans qu'elle ait eu lieu (correctif de la
    // commande orpheline). L'intention du test est inchangee.
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCalculateFreightMock.mockResolvedValue([{ logisticName: 'Standard', logisticPrice: '99', logisticAging: '7-12' }]);
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

// ============================================================
// P1 FULFILLMENT -- SELECTION DE L'OPTION REELLEMENT EXPEDIEE
//
// Les tests sont regroupes par INVARIANT METIER, pas par branche de code :
// chacun doit rester valide si l'implementation change.
//
// I1  l'option envoyee existe reellement dans le devis CJ du moment
// I2  son prix n'excede jamais le montant encaisse
// I3  son delai n'excede jamais le delai communique a l'acheteur
// I4  aucune selection par rang de tableau ; CJ ne choisit jamais
// I5  aucune creation sans devis exploitable
// I6  la reconciliation precede toute decision terminale
// I7  tout ecart promis/envoye est journalise
// I8  non-regression du modele semi-automatise
// I9  robustesse du parsing du delai promis
// I10 cj_pay_attempts conserve sa semantique
// ============================================================

/** Sequence complete d'une commande reelle, jusqu'a la decision d'expedition. */
function setupOrder(overrides: Record<string, unknown> = {}) {
  queueStandardClaimedSetup(overrides);
  reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
  cjCreateOrderMock.mockResolvedValue({ orderId: 'cj-order-1' });
  queueWrite();
}
const sentOption = () => (cjCreateOrderMock.mock.calls[0]?.[2] as any)?.logisticName;
const anomaly = (type: string) =>
  logAnomalyMock.mock.calls.map((c) => c[0] as any).find((a) => a.type === type);

describe('P1/I1+I2 — le garde-fou porte sur l’option ENVOYÉE, jamais sur une autre', () => {
  it('méthode enregistrée retrouvée et admissible -> c’est ELLE qui part', async () => {
    setupOrder();
    cjCalculateFreightMock.mockResolvedValue([
      { logisticName: 'CJPacket', logisticPrice: '4', logisticAging: '15-25' },
      { logisticName: 'Standard', logisticPrice: '9', logisticAging: '7-12' },
    ]);
    await fulfillCjOrder('order-1');
    expect(cjCreateOrderMock).toHaveBeenCalledTimes(1);
    expect(sentOption()).toBe('Standard');           // pas la moins chere
  });

  it('CONTRE-EXEMPLE Math.min : promis à 15, encaissé 10.80, éco à 4 -> REFUS', async () => {
    // Ce panier passait AVANT le correctif : min(4) <= 10.80 validait le
    // garde-fou, et la commande partait sur l'option a 15.
    setupOrder({ shipping_amount: 10.8 });
    cjCalculateFreightMock.mockResolvedValue([
      { logisticName: 'CJPacket', logisticPrice: '4', logisticAging: '15-25' },
      { logisticName: 'Standard', logisticPrice: '15', logisticAging: '7-12' },
    ]);
    const r = await fulfillCjOrder('order-1');
    expect(r).toEqual([]);
    expect(cjCreateOrderMock).not.toHaveBeenCalled();
    expect(anomaly('cj_shipping_cost_exceeds_charged')).toMatchObject({
      severity: 'blocked',
      details: expect.objectContaining({ realShippingCost: 15, charged: 10.8 }),
    });
  });
});

describe('P1/I3 — le délai communiqué à l’acheteur borne l’expédition', () => {
  it('méthode enregistrée devenue trop lente -> REFUS (prix pourtant admissible)', async () => {
    setupOrder({ estimated_delivery: '12 days' });
    cjCalculateFreightMock.mockResolvedValue([{ logisticName: 'Standard', logisticPrice: '5', logisticAging: '20-40' }]);
    const r = await fulfillCjOrder('order-1');
    expect(r).toEqual([]);
    expect(cjCreateOrderMock).not.toHaveBeenCalled();
    expect(anomaly('cj_shipping_no_admissible_option')).toMatchObject({
      details: expect.objectContaining({ reason: 'promised_too_slow' }),
    });
  });

  it('option sans délai annoncé alors qu’un délai a été promis -> non admissible', async () => {
    // On ne verifie pas ce qu'on ignore : un delai absent n'est pas un delai court.
    setupOrder({ shipment_logistic_name: null, estimated_delivery: '12 days' });
    cjCalculateFreightMock.mockResolvedValue([{ logisticName: 'Inconnu', logisticPrice: '2' }]);
    const r = await fulfillCjOrder('order-1');
    expect(r).toEqual([]);
    expect(anomaly('cj_shipping_no_admissible_option')).toMatchObject({
      details: expect.objectContaining({ reason: 'none_admissible' }),
    });
  });
});

describe('P1/I1+I4 — méthode enregistrée disparue : REFUS, jamais un remplacement', () => {
  it('le transporteur promis n’est plus proposé -> refus, même si d’autres options conviennent', async () => {
    setupOrder();
    cjCalculateFreightMock.mockResolvedValue([
      { logisticName: 'FedEx', logisticPrice: '3', logisticAging: '2-4' },   // admissible
      { logisticName: 'DHL', logisticPrice: '4', logisticAging: '2-3' },     // admissible
    ]);
    const r = await fulfillCjOrder('order-1');
    expect(r).toEqual([]);
    expect(cjCreateOrderMock).not.toHaveBeenCalled();
    expect(anomaly('cj_shipping_no_admissible_option')).toMatchObject({
      details: expect.objectContaining({ reason: 'promised_not_offered', promised: 'Standard' }),
    });
  });

  it('freight[0] n’est JAMAIS retenu par son rang', async () => {
    setupOrder({ shipment_logistic_name: null, estimated_delivery: '20 days' });
    cjCalculateFreightMock.mockResolvedValue([
      { logisticName: 'PremierDuTableau', logisticPrice: '8', logisticAging: '5-9' },
      { logisticName: 'MoinsChere', logisticPrice: '3', logisticAging: '10-18' },
    ]);
    await fulfillCjOrder('order-1');
    expect(sentOption()).toBe('MoinsChere');
    expect(sentOption()).not.toBe('PremierDuTableau');
  });
});

describe('P1/I4+I7 — aucune méthode enregistrée (cas produit par le P0)', () => {
  it('option admissible existante -> commande créée, PAS bloquée', async () => {
    setupOrder({ shipment_logistic_name: null, estimated_delivery: '15 days' });
    cjCalculateFreightMock.mockResolvedValue([
      { logisticName: 'CJPacket', logisticPrice: '6', logisticAging: '9-15' },
      { logisticName: 'DHL', logisticPrice: '40', logisticAging: '2-3' },
    ]);
    const r = await fulfillCjOrder('order-1');
    expect(r).toEqual(['vid-1']);
    expect(sentOption()).toBe('CJPacket');
  });

  it('la sélection est JOURNALISÉE, en info, sans e-mail ni effet métier', async () => {
    setupOrder({ shipment_logistic_name: null, estimated_delivery: '15 days' });
    cjCalculateFreightMock.mockResolvedValue([{ logisticName: 'CJPacket', logisticPrice: '6', logisticAging: '9-15' }]);
    await fulfillCjOrder('order-1');
    expect(anomaly('cj_shipping_option_reselected')).toMatchObject({
      severity: 'info',                                  // severity info => logAnomaly sort avant tout envoi d'e-mail
      details: expect.objectContaining({ promised: null, sent: 'CJPacket', sentPrice: 6, charged: 10, promisedMaxDays: 15 }),
    });
  });

  it('aucune option admissible -> REFUS', async () => {
    setupOrder({ shipment_logistic_name: null, estimated_delivery: '15 days' });
    cjCalculateFreightMock.mockResolvedValue([{ logisticName: 'DHL', logisticPrice: '40', logisticAging: '2-3' }]);
    const r = await fulfillCjOrder('order-1');
    expect(r).toEqual([]);
    expect(anomaly('cj_shipping_no_admissible_option')).toMatchObject({
      details: expect.objectContaining({ reason: 'none_admissible' }),
    });
  });

  it('OPTION C : aucune méthode ET aucun délai communiqué -> REFUS, jamais d’expédition sur une seule dimension', async () => {
    setupOrder({ shipment_logistic_name: null, estimated_delivery: null });
    cjCalculateFreightMock.mockResolvedValue([{ logisticName: 'Bateau', logisticPrice: '1', logisticAging: '60-90' }]);
    const r = await fulfillCjOrder('order-1');
    expect(r).toEqual([]);
    expect(cjCreateOrderMock).not.toHaveBeenCalled();
    expect(anomaly('cj_shipping_no_admissible_option')).toMatchObject({
      details: expect.objectContaining({ reason: 'no_promise_no_delay' }),
    });
  });
});

describe('P1/I5 — aucune création sans devis exploitable', () => {
  it('cjCalculateFreight en ERREUR -> aucune création, aucun statut terminal, rejouable', async () => {
    queueStandardClaimedSetup();
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCalculateFreightMock.mockRejectedValue(new Error('CJ 429'));
    const r = await fulfillCjOrder('order-1');
    expect(r).toEqual([]);
    expect(cjCreateOrderMock).not.toHaveBeenCalled();
    expect(anomaly('cj_freight_unavailable')).toMatchObject({ severity: 'info', details: expect.objectContaining({ reason: 'error' }) });
    // Aucun statut terminal : le verrou 'processing' subsiste, le groupe 2 du
    // cron reprend la commande une fois le verrou perime.
    expect(updateCalls.some((c) => (c.payload as any).cj_pay_status === 'failed')).toBe(false);
  });

  it('devis VIDE (réponse CJ valide) -> aucune création, cause distincte de l’erreur', async () => {
    queueStandardClaimedSetup();
    reconcileWithCjMock.mockResolvedValue({ kind: 'NOT_FOUND' });
    cjCalculateFreightMock.mockResolvedValue([]);
    const r = await fulfillCjOrder('order-1');
    expect(r).toEqual([]);
    expect(cjCreateOrderMock).not.toHaveBeenCalled();
    expect(anomaly('cj_freight_unavailable')).toMatchObject({ details: expect.objectContaining({ reason: 'empty' }) });
  });
});

describe('P1/I6 — la réconciliation précède toute décision terminale', () => {
  it('commande DÉJÀ créée chez CJ + coût devenu excessif -> réconciliée, jamais refusée à tort', async () => {
    // Defaut corrige : le garde-fou, place avant la reconciliation, ecrivait
    // 'failed' sans jamais la declencher -- la commande CJ existante devenait
    // definitivement invisible.
    queueStandardClaimedSetup({ shipping_amount: 1 });
    reconcileWithCjMock.mockResolvedValue({ kind: 'FOUND_AWAITING', cjOrderId: 'cj-existant' });
    cjCalculateFreightMock.mockResolvedValue([{ logisticName: 'Standard', logisticPrice: '99', logisticAging: '7-12' }]);
    queueWrite();
    await fulfillCjOrder('order-1');
    expect(updateCalls.find((c) => (c.payload as any).cj_order_id === 'cj-existant')).toBeTruthy();
    expect(updateCalls.some((c) => (c.payload as any).cj_pay_status === 'failed')).toBe(false);
    expect(cjCalculateFreightMock).not.toHaveBeenCalled();   // devis inutile : la commande existe
    expect(cjCreateOrderMock).not.toHaveBeenCalled();
  });
});

describe('P1/I8+I10 — non-régression du modèle semi-automatisé', () => {
  it('payType 3, awaiting_manual_payment et alerte manuelle inchangés', async () => {
    setupOrder();
    await fulfillCjOrder('order-1');
    expect(cjCreateOrderMock.mock.calls[0][2]).toMatchObject({ payType: 3, logisticName: 'Standard' });
    expect(updateCalls.find((c) => (c.payload as any).cj_pay_status === 'awaiting_manual_payment')).toBeTruthy();
    expect(anomaly('cj_awaiting_manual_payment')).toBeTruthy();
  });

  it('un refus d’admissibilité NE consomme PAS cj_pay_attempts', async () => {
    // Ce compteur mesure les appels reels a cjCreateOrder. L'incrementer ici
    // empecherait une recuperation legitime : prix et delais CJ fluctuent.
    setupOrder({ shipment_logistic_name: 'Disparu' });
    cjCalculateFreightMock.mockResolvedValue([{ logisticName: 'Autre', logisticPrice: '2', logisticAging: '3-5' }]);
    await fulfillCjOrder('order-1');
    expect(updateCalls.every((c) => !('cj_pay_attempts' in (c.payload as any)))).toBe(true);
    const failed = updateCalls.find((c) => (c.payload as any).cj_pay_status === 'failed');
    expect(failed).toBeTruthy();                       // refus bien tracé
  });
});

describe('P1/I9 — parsing du délai promis : jamais 0, jamais une supposition', () => {
  it.each([
    ['15 days', 15],
    ['7.5 days', 7.5],
    ['12 jours', 12],
    ['  9  ', 9],
    [null, null],
    ['', null],
    ['bientôt', null],
    ['0 days', null],          // 0 rendrait TOUTE option inadmissible
    [undefined, null],
    [15, null],                 // non-chaîne
  ])('parsePromisedMaxDays(%o) = %o', (input, expected) => {
    expect(parsePromisedMaxDays(input)).toBe(expected);
  });

  it('délai illisible -> contrainte de délai INACTIVE, contrainte de prix seule', async () => {
    setupOrder({ estimated_delivery: 'bientôt' });
    cjCalculateFreightMock.mockResolvedValue([{ logisticName: 'Standard', logisticPrice: '5', logisticAging: '40-90' }]);
    const r = await fulfillCjOrder('order-1');
    expect(r).toEqual(['vid-1']);       // pas de blocage : rien n'a été promis par écrit
    expect(sentOption()).toBe('Standard');
  });
});
