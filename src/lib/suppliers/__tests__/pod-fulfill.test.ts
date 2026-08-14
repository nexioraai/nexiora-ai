import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// P0-3.9 — Tests d'intégration de pod-fulfill.ts restructuré.
// Toute la couche DB (supabaseAdmin) et les adaptateurs sont mockés :
// ceci teste la LOGIQUE D'ORCHESTRATION (groupement par fournisseur,
// séquencement Submission -> adapter -> upsert/transition), pas
// l'atomicité réelle des RPC (déjà validée en base réelle, P0-3.8B).
// ============================================================

const ORDER_ID = 'order-1';
const UNIT_A = 'unit-a';
const UNIT_B = 'unit-b';
const UNIT_C = 'unit-c';

function tableChain(response: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.in = vi.fn(self);
  chain.update = vi.fn(self);
  chain.maybeSingle = vi.fn(async () => response);
  // Rend la chaîne elle-même "thenable" pour les requêtes awaited sans
  // .maybeSingle() (ex: .select().in(...) résolvant directement en liste).
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

const createOrderPrintfulMock = vi.fn();
const createOrderGelatoMock = vi.fn();
const createOrderPrintifyMock = vi.fn();
vi.mock('../printful-adapter', () => ({
  printfulAdapter: { createOrder: (...a: unknown[]) => createOrderPrintfulMock(...a) },
  printfulCredentials: { printful_token: 'test-printful-token' },
}));
vi.mock('../gelato-adapter', () => ({
  gelatoAdapter: { createOrder: (...a: unknown[]) => createOrderGelatoMock(...a) },
  gelatoCredentials: {},
}));
vi.mock('../printify-adapter', () => ({
  printifyAdapter: { createOrder: (...a: unknown[]) => createOrderPrintifyMock(...a) },
  printifyCredentials: { printify_token: 'test-printify-token', printify_shop_id: 'test-shop-id' },
}));

const createProviderSubmissionMock = vi.fn();
const claimSubmissionAttemptMock = vi.fn();
const transitionSubmissionStatusMock = vi.fn();
vi.mock('@/lib/fulfillment/submission-service', () => ({
  createProviderSubmission: (...a: unknown[]) => createProviderSubmissionMock(...a),
  claimSubmissionAttempt: (...a: unknown[]) => claimSubmissionAttemptMock(...a),
  transitionSubmissionStatus: (...a: unknown[]) => transitionSubmissionStatusMock(...a),
}));

const upsertProviderOrderMock = vi.fn();
vi.mock('@/lib/fulfillment/provider-order-service', () => ({
  upsertProviderOrder: (...a: unknown[]) => upsertProviderOrderMock(...a),
}));

import { fulfillPodOrder } from '../pod-fulfill';

function setupBaseTables(catalogItems: { id: string; product_id: string; quantity: number }[], catProds: { id: string; supplier_id: string; supplier_product_id: string }[]) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'shop_orders') {
      return tableChain({ data: { id: ORDER_ID, site_id: 's1', shipping_address: {}, customer_name: 'C', customer_email: 'c@x.com' }, error: null });
    }
    if (table === 'shop_order_items') {
      return tableChain({ data: catalogItems, error: null });
    }
    if (table === 'catalog_products') {
      return tableChain({ data: catProds, error: null });
    }
    if (table === 'order_item_designs') {
      return tableChain({ data: [], error: null });
    }
    return tableChain({ data: null, error: null });
  });
}

beforeEach(() => {
  fromMock.mockReset();
  createOrderPrintfulMock.mockReset();
  createOrderGelatoMock.mockReset();
  createOrderPrintifyMock.mockReset();
  createProviderSubmissionMock.mockReset();
  claimSubmissionAttemptMock.mockReset();
  transitionSubmissionStatusMock.mockReset();
  upsertProviderOrderMock.mockReset();
  claimSubmissionAttemptMock.mockResolvedValue({ success: true, attempt_count: 1 });
  transitionSubmissionStatusMock.mockResolvedValue({ success: true });
  upsertProviderOrderMock.mockResolvedValue({ success: true, provider_order_row_id: 'row', was_new: true, late_webhook: false });
});

describe('1. Printful submission creation', () => {
  it('crée une submission puis une provider order pour un seul item printful', async () => {
    setupBaseTables(
      [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }],
      [{ id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' }]
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-pf-1' });
    createOrderPrintfulMock.mockResolvedValue({ success: true, supplier_order_id: 'PF-100' });

    const result = await fulfillPodOrder(ORDER_ID);

    expect(createProviderSubmissionMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID, provider: 'printful', fulfillmentUnitIds: [UNIT_A] })
    );
    expect(upsertProviderOrderMock).toHaveBeenCalledWith(expect.objectContaining({ submissionId: 'sub-pf-1', provider: 'printful', providerOrderId: 'PF-100' }));
    expect(transitionSubmissionStatusMock).toHaveBeenCalledWith('sub-pf-1', 'success', ['processing', 'uncertain']);
    expect(result).toEqual(['PF-100']);
  });
});

describe('2-3. Gelato order-level submission — plusieurs items -> UNE seule submission', () => {
  it('appelle createProviderSubmission UNE SEULE fois avec tous les fulfillment_unit_ids gelato', async () => {
    setupBaseTables(
      [
        { id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 },
        { id: UNIT_B, product_id: `catalog-${UNIT_B}`, quantity: 1 },
      ],
      [
        { id: UNIT_A, supplier_id: 'gelato', supplier_product_id: 'gl-1' },
        { id: UNIT_B, supplier_id: 'gelato', supplier_product_id: 'gl-2' },
      ]
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-gl-1' });
    createOrderGelatoMock
      .mockResolvedValueOnce({ success: true, supplier_order_id: 'GL-A' })
      .mockResolvedValueOnce({ success: true, supplier_order_id: 'GL-B' });

    await fulfillPodOrder(ORDER_ID);

    expect(createProviderSubmissionMock).toHaveBeenCalledTimes(1);
    expect(createProviderSubmissionMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gelato', fulfillmentUnitIds: [UNIT_A, UNIT_B] })
    );
  });
});

describe('4. Gelato multiple items -> multiple provider orders', () => {
  it('appelle upsertProviderOrder une fois par item réussi, tous liés à la même submission', async () => {
    setupBaseTables(
      [
        { id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 },
        { id: UNIT_B, product_id: `catalog-${UNIT_B}`, quantity: 1 },
        { id: UNIT_C, product_id: `catalog-${UNIT_C}`, quantity: 1 },
      ],
      [
        { id: UNIT_A, supplier_id: 'gelato', supplier_product_id: 'gl-1' },
        { id: UNIT_B, supplier_id: 'gelato', supplier_product_id: 'gl-2' },
        { id: UNIT_C, supplier_id: 'gelato', supplier_product_id: 'gl-3' },
      ]
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-gl-2' });
    createOrderGelatoMock
      .mockResolvedValueOnce({ success: true, supplier_order_id: 'GL-A' })
      .mockResolvedValueOnce({ success: true, supplier_order_id: 'GL-B' })
      .mockResolvedValueOnce({ success: true, supplier_order_id: 'GL-C' });

    const result = await fulfillPodOrder(ORDER_ID);

    expect(upsertProviderOrderMock).toHaveBeenCalledTimes(3);
    for (const call of upsertProviderOrderMock.mock.calls) {
      expect((call[0] as { submissionId: string }).submissionId).toBe('sub-gl-2');
    }
    expect(result).toEqual(['GL-A', 'GL-B', 'GL-C']);
    expect(transitionSubmissionStatusMock).toHaveBeenCalledWith('sub-gl-2', 'success', ['processing', 'uncertain']);
  });
});

describe('5-6-12-14. Duplicate/concurrent checkout — pas de nouvelle commande si la submission est déjà active', () => {
  it('createProviderSubmission ACTIVE_SUBMISSION_NOT_TERMINAL -> aucun appel adapter, aucune écriture supplémentaire', async () => {
    setupBaseTables(
      [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }],
      [{ id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' }]
    );
    createProviderSubmissionMock.mockResolvedValue({ success: false, reason: 'ACTIVE_SUBMISSION_NOT_TERMINAL' });

    const result = await fulfillPodOrder(ORDER_ID);

    expect(createOrderPrintfulMock).not.toHaveBeenCalled();
    expect(upsertProviderOrderMock).not.toHaveBeenCalled();
    expect(transitionSubmissionStatusMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('claim perdu (course concurrente) -> aucun appel adapter', async () => {
    setupBaseTables(
      [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }],
      [{ id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' }]
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-x' });
    claimSubmissionAttemptMock.mockResolvedValue({ success: false, reason: 'CLAIM_LOST_OR_INVALID_STATE' });

    await fulfillPodOrder(ORDER_ID);

    expect(createOrderPrintfulMock).not.toHaveBeenCalled();
  });
});

describe('7. Provider timeout / erreur réseau -> UNCERTAIN', () => {
  it('adapter lève une exception sans code HTTP -> transition uncertain', async () => {
    setupBaseTables(
      [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }],
      [{ id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' }]
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-timeout' });
    createOrderPrintfulMock.mockRejectedValue(new Error('fetch failed: ETIMEDOUT'));

    await fulfillPodOrder(ORDER_ID);

    expect(transitionSubmissionStatusMock).toHaveBeenCalledWith(
      'sub-timeout', 'uncertain', ['processing', 'uncertain'], expect.objectContaining({ error: expect.stringContaining('ETIMEDOUT') })
    );
  });
});

describe('8. Provider permanent error (code HTTP 4xx démontré dans le code adapter)', () => {
  it('erreur Printful 422 -> failed_permanent', async () => {
    setupBaseTables(
      [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }],
      [{ id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' }]
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-perm' });
    createOrderPrintfulMock.mockResolvedValue({ success: false, error_message: 'Printful 422: invalid variant' });

    await fulfillPodOrder(ORDER_ID);

    expect(transitionSubmissionStatusMock).toHaveBeenCalledWith('sub-perm', 'failed_permanent', ['processing', 'uncertain'], expect.anything());
  });
});

describe('9. Provider unknown error -> UNCERTAIN, jamais inventé', () => {
  it('message non classifiable -> uncertain', async () => {
    setupBaseTables(
      [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }],
      [{ id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' }]
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-unk' });
    createOrderPrintfulMock.mockResolvedValue({ success: false, error_message: 'something odd happened' });

    await fulfillPodOrder(ORDER_ID);

    expect(transitionSubmissionStatusMock).toHaveBeenCalledWith('sub-unk', 'uncertain', ['processing', 'uncertain'], expect.anything());
  });
});

describe('10. Provider response malformée (success sans supplier_order_id)', () => {
  it('ne persiste PAS un provider_order sans id réel, traite comme un échec', async () => {
    setupBaseTables(
      [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }],
      [{ id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' }]
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-malformed' });
    createOrderPrintfulMock.mockResolvedValue({ success: true, supplier_order_id: '' });

    const result = await fulfillPodOrder(ORDER_ID);

    expect(upsertProviderOrderMock).not.toHaveBeenCalled();
    expect(transitionSubmissionStatusMock).toHaveBeenCalledWith('sub-malformed', 'uncertain', ['processing', 'uncertain'], expect.anything());
    expect(result).toEqual([]);
  });
});

describe('11. Résultat partiel Gelato — jamais SUCCESS si un item reste non résolu', () => {
  it('item A réussit, item B échoue -> submission UNCERTAIN (jamais SUCCESS ni FAILED_PERMANENT)', async () => {
    setupBaseTables(
      [
        { id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 },
        { id: UNIT_B, product_id: `catalog-${UNIT_B}`, quantity: 1 },
      ],
      [
        { id: UNIT_A, supplier_id: 'gelato', supplier_product_id: 'gl-1' },
        { id: UNIT_B, supplier_id: 'gelato', supplier_product_id: 'gl-2' },
      ]
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-partial' });
    createOrderGelatoMock
      .mockResolvedValueOnce({ success: true, supplier_order_id: 'GL-A' })
      .mockResolvedValueOnce({ success: false, error_message: 'Gelato 503 /v2/orders: unavailable' });

    const result = await fulfillPodOrder(ORDER_ID);

    // L'item A réussi est bien persisté malgré l'échec de B.
    expect(upsertProviderOrderMock).toHaveBeenCalledTimes(1);
    expect(upsertProviderOrderMock).toHaveBeenCalledWith(expect.objectContaining({ providerOrderId: 'GL-A' }));
    expect(result).toEqual(['GL-A']);
    // La submission entière reste UNCERTAIN, jamais SUCCESS malgré le succès partiel.
    expect(transitionSubmissionStatusMock).toHaveBeenCalledWith('sub-partial', 'uncertain', ['processing', 'uncertain']);
  });
});

describe('Printify — chemin legacy inchangé', () => {
  it('ne passe jamais par createProviderSubmission (hors périmètre P0-3.7/P0-3.8)', async () => {
    setupBaseTables(
      [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }],
      [{ id: UNIT_A, supplier_id: 'printify', supplier_product_id: 'py-1' }]
    );
    createOrderPrintifyMock.mockResolvedValue({ success: true, supplier_order_id: 'PY-1' });

    const result = await fulfillPodOrder(ORDER_ID);

    expect(createProviderSubmissionMock).not.toHaveBeenCalled();
    expect(createOrderPrintifyMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['PY-1']);
  });
});

describe('13. P0-3.9.6 Gap #3 — écriture de résultat acceptée depuis UNCERTAIN', () => {
  it('un résultat tardif (réponse réseau enfin obtenue après un basculement UNCERTAIN par le cron, Gap #2) est toujours écrit — la garde RPC réelle (P0-3.8B) accepte processing ET uncertain comme état de départ', async () => {
    setupBaseTables(
      [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }],
      [{ id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' }]
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-late-result' });
    createOrderPrintfulMock.mockResolvedValue({ success: true, supplier_order_id: 'PF-LATE' });
    // Simule le RPC réel refermant sur un état déjà UNCERTAIN (transition
    // conditionnelle acceptée car 'uncertain' figure dans expected_statuses).
    transitionSubmissionStatusMock.mockResolvedValue({ success: true });

    const result = await fulfillPodOrder(ORDER_ID);

    expect(transitionSubmissionStatusMock).toHaveBeenCalledWith('sub-late-result', 'success', ['processing', 'uncertain']);
    expect(result).toEqual(['PF-LATE']);
  });

  it('aucun appel transitionSubmissionStatus de ce module n\'accepte jamais un état terminal en entrée (Gap #3A, immutabilité terminale)', async () => {
    setupBaseTables(
      [
        { id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 },
        { id: UNIT_B, product_id: `catalog-${UNIT_B}`, quantity: 1 },
      ],
      [
        { id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' },
        { id: UNIT_B, supplier_id: 'gelato', supplier_product_id: 'gl-1' },
      ]
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-terminal-check' });
    createOrderPrintfulMock.mockResolvedValue({ success: true, supplier_order_id: 'PF-1' });
    createOrderGelatoMock.mockResolvedValue({ success: false, error_message: 'Gelato 500: down' });

    await fulfillPodOrder(ORDER_ID);

    const TERMINAL = new Set(['success', 'failed_confirmed', 'failed_permanent']);
    expect(transitionSubmissionStatusMock.mock.calls.length).toBeGreaterThan(0);
    for (const call of transitionSubmissionStatusMock.mock.calls) {
      const expectedStatuses = call[2] as string[];
      for (const s of expectedStatuses) {
        expect(TERMINAL.has(s)).toBe(false);
      }
    }
  });
});
