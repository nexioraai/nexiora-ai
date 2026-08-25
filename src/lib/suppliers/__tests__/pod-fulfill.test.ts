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
  // LOT 3 / L3-06 -- `.in('supplier_id', ...)` FILTRE REELLEMENT.
  //
  // Le harnais renvoyait les lignes quel que soit le filtre : la restriction
  // `.in('supplier_id', ['printful','printify','gelato'])` de `pod-fulfill`
  // etait donc invisible aux tests, et la retirer ne cassait rien (mutation
  // P9). Or c'est la SEULE garde de cette couche : une ligne d'un autre
  // fournisseur tombe dans `legacyItems` et part chez PRINTIFY. Le harnais
  // simule desormais ce filtre, ce qui rend la garde observable.
  chain.in = vi.fn((col: string, vals: unknown[]) => {
    if (col === 'supplier_id' && Array.isArray(response.data)) {
      response = { ...response, data: (response.data as any[]).filter((r) => vals.includes(r?.supplier_id)) };
      chain.then = (resolve: (v: unknown) => void) => resolve(response);
    }
    return chain;
  });
  chain.update = vi.fn(self);
  chain.maybeSingle = vi.fn(async () => response);
  // Rend la chaîne elle-même "thenable" pour les requêtes awaited sans
  // .maybeSingle() (ex: .select().in(...) résolvant directement en liste).
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock, rpcMock } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...(args as [string])),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
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

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({
  logAnomaly: (...a: unknown[]) => logAnomalyMock(...a),
}));

import { fulfillPodOrder } from '../pod-fulfill';

// dropshipType par defaut = 'pod_custom' (autorise) : ces tables/tests
// preexistants portent sur l'orchestration des soumissions fournisseur,
// pas sur la politique de design (F-CUSTOM-02/03, garde ajoutee
// separement) -- ce defaut preserve leur comportement d'origine, ou rien
// ne filtrait encore design_url/design_files.
function setupBaseTables(
  catalogItems: { id: string; product_id: string; quantity: number }[],
  catProds: { id: string; supplier_id: string; supplier_product_id: string }[],
  options: { dropshipType?: string | null; designs?: { order_item_id: string; design_url: string; placement?: string; position?: unknown }[] } = {}
) {
  const { dropshipType = 'pod_custom', designs = [] } = options;
  fromMock.mockImplementation((table: string) => {
    if (table === 'shop_orders') {
      return tableChain({ data: { id: ORDER_ID, site_id: 's1', fulfillment_domain: 'supplier', shipping_address: {}, customer_name: 'C', customer_email: 'c@x.com' }, error: null });
    }
    if (table === 'sites') {
      return tableChain({ data: { dropship_type: dropshipType }, error: null });
    }
    if (table === 'shop_order_items') {
      return tableChain({ data: catalogItems, error: null });
    }
    if (table === 'catalog_products') {
      return tableChain({ data: catProds, error: null });
    }
    if (table === 'order_item_designs') {
      return tableChain({ data: designs, error: null });
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
  logAnomalyMock.mockReset();
  rpcMock.mockReset();
  claimSubmissionAttemptMock.mockResolvedValue({ success: true, attempt_count: 1 });
  transitionSubmissionStatusMock.mockResolvedValue({ success: true });
  upsertProviderOrderMock.mockResolvedValue({ success: true, provider_order_row_id: 'row', was_new: true, late_webhook: false });
  rpcMock.mockResolvedValue({ data: { success: true }, error: null });
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

describe('F-CUSTOM-02/03 — deuxième barrière indépendante : le design n\'est jamais transmis si dropship_type ne l\'autorise pas', () => {
  it.each([
    ['reseller', 'reseller'],
    ['null', null],
    ['valeur inattendue', 'legacy_mode_x'],
  ])('dropship_type=%s -> design_url/design_files absents des orderParams malgré un design présent en base, anomalie journalisée', async (_label, dropshipType) => {
    setupBaseTables(
      [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }],
      [{ id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' }],
      { dropshipType, designs: [{ order_item_id: UNIT_A, design_url: 'https://evil.example/x.png', placement: 'front' }] }
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-gate' });
    createOrderPrintfulMock.mockResolvedValue({ success: true, supplier_order_id: 'PF-GATE' });

    await fulfillPodOrder(ORDER_ID);

    expect(createOrderPrintfulMock).toHaveBeenCalledWith(
      expect.objectContaining({ design_url: undefined, design_files: undefined }),
      expect.anything()
    );
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pod_fulfill_design_stripped', siteId: 's1' })
    );
  });

  it.each([
    ['pod_brand', 'pod_brand'],
    ['pod_custom', 'pod_custom'],
  ])('dropship_type=%s -> design_url transmis normalement, aucune anomalie journalisée', async (_label, dropshipType) => {
    setupBaseTables(
      [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }],
      [{ id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' }],
      { dropshipType, designs: [{ order_item_id: UNIT_A, design_url: 'https://x.test/design.png', placement: 'front' }] }
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-ok' });
    createOrderPrintfulMock.mockResolvedValue({ success: true, supplier_order_id: 'PF-OK' });

    await fulfillPodOrder(ORDER_ID);

    expect(createOrderPrintfulMock).toHaveBeenCalledWith(
      expect.objectContaining({ design_url: 'https://x.test/design.png' }),
      expect.anything()
    );
    expect(logAnomalyMock).not.toHaveBeenCalled();
  });

  it('lecture de sites introuvable/vide (orderSite null) -> fail-closed, design jamais transmis', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'shop_orders') {
        return tableChain({ data: { id: ORDER_ID, site_id: 's1', fulfillment_domain: 'supplier', shipping_address: {}, customer_name: 'C', customer_email: 'c@x.com' }, error: null });
      }
      if (table === 'sites') return tableChain({ data: null, error: null });
      if (table === 'shop_order_items') {
        return tableChain({ data: [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }], error: null });
      }
      if (table === 'catalog_products') {
        return tableChain({ data: [{ id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' }], error: null });
      }
      if (table === 'order_item_designs') {
        return tableChain({ data: [{ order_item_id: UNIT_A, design_url: 'https://x.test/d.png', placement: 'front' }], error: null });
      }
      return tableChain({ data: null, error: null });
    });
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-null-site' });
    createOrderPrintfulMock.mockResolvedValue({ success: true, supplier_order_id: 'PF-NULLSITE' });

    await fulfillPodOrder(ORDER_ID);

    expect(createOrderPrintfulMock).toHaveBeenCalledWith(
      expect.objectContaining({ design_url: undefined }),
      expect.anything()
    );
  });

  it('aucun design en base et dropship_type=reseller -> aucune anomalie journalisée (rien à signaler)', async () => {
    setupBaseTables(
      [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }],
      [{ id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' }],
      { dropshipType: 'reseller', designs: [] }
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-no-design' });
    createOrderPrintfulMock.mockResolvedValue({ success: true, supplier_order_id: 'PF-ND' });

    await fulfillPodOrder(ORDER_ID);

    expect(logAnomalyMock).not.toHaveBeenCalled();
  });
});

describe('LOT H (F-POD-01) — la transition vers processing passe par apply_shop_order_status(), plus par un .update() nu', () => {
  it('au moins une commande fournisseur créée -> RPC appelée avec order_id, processing, allowed_current=[paid]', async () => {
    setupBaseTables(
      [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }],
      [{ id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' }],
      { dropshipType: 'pod_custom' }
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-1' });
    createOrderPrintfulMock.mockResolvedValue({ success: true, supplier_order_id: 'PF-1' });

    await fulfillPodOrder(ORDER_ID);

    expect(rpcMock).toHaveBeenCalledWith('apply_shop_order_status', {
      p_order_id: ORDER_ID,
      p_target_status: 'processing',
      p_allowed_current: ['paid'],
    });
  });

  it('aucune commande fournisseur créée (tous les items échouent) -> RPC jamais appelée', async () => {
    setupBaseTables(
      [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }],
      [{ id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' }],
      { dropshipType: 'pod_custom' }
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-1' });
    createOrderPrintfulMock.mockResolvedValue({ success: false, error_message: 'Printful 422: invalid variant' });

    await fulfillPodOrder(ORDER_ID);

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('RPC retourne success:false (transition illégale rejetée par le trigger, ou CAS non satisfait) -> ne lève jamais, se contente de logger', async () => {
    setupBaseTables(
      [{ id: UNIT_A, product_id: `catalog-${UNIT_A}`, quantity: 1 }],
      [{ id: UNIT_A, supplier_id: 'printful', supplier_product_id: 'pf-1' }],
      { dropshipType: 'pod_custom' }
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-1' });
    createOrderPrintfulMock.mockResolvedValue({ success: true, supplier_order_id: 'PF-1' });
    rpcMock.mockResolvedValue({ data: { success: false, reason: 'ILLEGAL_STATUS_TRANSITION: canceled -> processing' }, error: null });

    // Ne doit jamais lancer d'exception -- le fulfillment fournisseur a déjà
    // réussi (supplierOrderIds non vide), seul le reflet local du statut a
    // échoué ; l'appelant (handlePaidCheckout) ne doit pas planter pour
    // autant.
    await expect(fulfillPodOrder(ORDER_ID)).resolves.toEqual(['PF-1']);
  });
});

// ============================================================
// PHASE 3 — FRONTIERE DE DOMAINE.
// Plan de reference : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// Ces tests existent parce qu'un controle de mutation a montre que sans eux,
// retirer la garde de domaine de pod-fulfill.ts ne faisait echouer AUCUN
// test. Une garde qu'aucun test ne protege n'est pas une garde.
//
// Ce qu'ils verrouillent : la mesure faite sur le code deploye avait montre
// qu'une commande Mode 2 portant un item catalogue Printful atteignait
// reellement `adapter.createOrder` et obtenait un identifiant de commande
// fournisseur. C'est cette fuite, cote POD, qui est fermee ici.
// ============================================================
describe('PHASE 3 — seul un domaine « supplier » entre dans le fulfillment POD', () => {
  function setupDomaine(domaine: unknown) {
    fromMock.mockImplementation((table: string) => {
      if (table === 'shop_orders') {
        return tableChain({ data: { id: ORDER_ID, site_id: 's1', fulfillment_domain: domaine, shipping_address: {}, customer_name: 'C', customer_email: 'c@x.com' }, error: null });
      }
      if (table === 'sites') return tableChain({ data: { dropship_type: 'pod_custom' }, error: null });
      if (table === 'shop_order_items') return tableChain({ data: [{ id: 'i1', product_id: 'catalog-cp1', quantity: 1 }], error: null });
      if (table === 'catalog_products') return tableChain({ data: [{ id: 'cp1', supplier_id: 'printful', supplier_product_id: 'PF-9' }], error: null });
      if (table === 'order_item_designs') return tableChain({ data: [], error: null });
      return tableChain({ data: null, error: null });
    });
  }

  it.each([
    ['merchant', 'merchant'],
    ['absent (commande anterieure a la migration)', null],
    ['valeur inattendue', 'autre'],
  ])('domaine %s -> AUCUN appel Printful, AUCUN appel Gelato, AUCUNE soumission', async (_l, domaine) => {
    setupDomaine(domaine);
    const r = await fulfillPodOrder(ORDER_ID);
    expect(r).toEqual([]);
    expect(createOrderPrintfulMock).not.toHaveBeenCalled();
    expect(createOrderGelatoMock).not.toHaveBeenCalled();
    expect(createOrderPrintifyMock).not.toHaveBeenCalled();
    expect(createProviderSubmissionMock).not.toHaveBeenCalled();
  });

  it('le refus est TRACÉ, jamais silencieux — le domaine concerné est identifiable', async () => {
    // L'aiguillage n'appelle deja plus ce moteur pour une commande marchande :
    // arriver ici signifie que la frontiere a ete franchie ailleurs. Ce canari
    // ne doit jamais crier en fonctionnement normal -- et doit crier sinon.
    setupDomaine('merchant');
    await fulfillPodOrder(ORDER_ID);
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pod_fulfill_domain_refuse',
        details: expect.objectContaining({ domain: 'MODE_2' }),
      })
    );
  });

  it('domaine supplier -> AUCUNE anomalie de frontiere (le canari ne crie pas pour rien)', async () => {
    setupDomaine('supplier');
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-1' });
    claimSubmissionAttemptMock.mockResolvedValue({ success: true });
    createOrderPrintfulMock.mockResolvedValue({ success: true, supplier_order_id: 'PF-1' });
    await fulfillPodOrder(ORDER_ID);
    expect(logAnomalyMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pod_fulfill_domain_refuse' })
    );
  });

  it('domaine supplier -> le fulfillment POD se deroule normalement', async () => {
    setupDomaine('supplier');
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-1' });
    claimSubmissionAttemptMock.mockResolvedValue({ success: true });
    createOrderPrintfulMock.mockResolvedValue({ success: true, supplier_order_id: 'PF-ORDER-1' });
    await fulfillPodOrder(ORDER_ID);
    expect(createOrderPrintfulMock).toHaveBeenCalled();
  });
});

// ============================================================
// LOT 3 / L3-06 -- LE CLOISONNEMENT FOURNISSEUR DU MOTEUR POD.
//
// `pod-fulfill` ne va chercher que des lignes `catalog_products` dont le
// `supplier_id` est POD. Ce n'est PAS un doublon de `suppliersForDropshipType`
// (qui repond « quels fournisseurs pour ce SOUS-TYPE ») : c'est la question
// « quels fournisseurs ce MOTEUR sait executer » -- d'ou `printify`, present
// ici et absent de l'autre. Deux questions, deux listes, aucune concurrence.
//
// SANS CE FILTRE, une ligne CJ tombe dans `legacyItems` et part chez PRINTIFY.
// Mutation P9, survivante avant ce lot faute d'un harnais qui filtre.
// ============================================================
describe('LOT 3 / L3-06 — seuls les fournisseurs POD atteignent ce moteur', () => {
  it('une ligne catalogue CJ n\'atteint AUCUN adaptateur POD', async () => {
    setupBaseTables(
      [{ id: 'it-1', product_id: 'catalog-cp-cj', quantity: 1 }],
      [{ id: 'cp-cj', supplier_id: 'cj', supplier_product_id: 'vid-1' }],
      { dropshipType: 'pod_brand' }
    );
    const res = await fulfillPodOrder(ORDER_ID);
    expect(res).toEqual([]);
    expect(createOrderPrintfulMock).not.toHaveBeenCalled();
    expect(createOrderGelatoMock).not.toHaveBeenCalled();
    expect(createOrderPrintifyMock).not.toHaveBeenCalled();
  });

  it('un fournisseur inconnu n\'atteint AUCUN adaptateur non plus', async () => {
    setupBaseTables(
      [{ id: 'it-1', product_id: 'catalog-cp-x', quantity: 1 }],
      [{ id: 'cp-x', supplier_id: 'fournisseur_inconnu', supplier_product_id: 'x-1' }],
      { dropshipType: 'pod_brand' }
    );
    expect(await fulfillPodOrder(ORDER_ID)).toEqual([]);
    expect(createOrderPrintifyMock).not.toHaveBeenCalled();
  });

  it('INVARIANT B — un pod_brand Printful passe bien, lui', async () => {
    setupBaseTables(
      [{ id: 'it-1', product_id: 'catalog-cp-pf', quantity: 1 }],
      [{ id: 'cp-pf', supplier_id: 'printful', supplier_product_id: 'sp-1' }],
      { dropshipType: 'pod_brand', designs: [{ order_item_id: 'it-1', design_url: 'https://x.test/d.png' }] }
    );
    createProviderSubmissionMock.mockResolvedValue({ success: true, submission_id: 'sub-lot3' });
    createOrderPrintfulMock.mockResolvedValue({ success: true, supplier_order_id: 'pf-1' });
    await fulfillPodOrder(ORDER_ID);
    expect(createOrderPrintfulMock).toHaveBeenCalled();
    const params = createOrderPrintfulMock.mock.calls[0][0];
    expect(params.design_url).toBe('https://x.test/d.png');
    // La variante envoyee est celle de la LIGNE CATALOGUE, jamais un suffixe
    // d'identifiant : c'est ce que consomme reellement printful-adapter.
    expect(params.supplier_product_id).toBe('sp-1');
  });
});
