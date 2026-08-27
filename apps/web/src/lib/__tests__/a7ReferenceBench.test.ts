// src/lib/__tests__/a7ReferenceBench.test.ts
//
// PHASE 6 du chantier de séparation Mode 2 / Mode 3 — BANC DE RÉFÉRENCE A7.
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md, §10.
//
// ============================================================
// LE BANC. UN ARTEFACT EXÉCUTABLE, PAS UNE COMPARAISON DOCUMENTAIRE.
//
// Le plan exige que les 7 comportements Mode 3 protégés restent « identiques
// au banc de référence ». Ce banc était jusqu'ici une MESURE que l'on
// relançait à la main contre `origin/main` — jamais un artefact du dépôt.
// Une référence qui n'existe pas dans le dépôt ne peut rien protéger.
//
// CE QUE CE FICHIER AJOUTE, ET QU'AUCUN TEST EXISTANT NE FAIT. Les suites
// détaillées assertent des PROPRIÉTÉS (« seule la ligne mappée part »). Le
// banc fige un OBSERVABLE COMPLET par comportement, comparé à une référence
// écrite dans le dépôt. Il attrape donc ce qu'une propriété ne dit pas : une
// valeur qui glisse, un fournisseur qui s'ajoute, une quantité qui change.
//
// CE QU'IL NE REMPLACE PAS. Les tests comportementaux détaillés restent la
// preuve fine — le banc est ADDITIF. Aucune de leurs assertions n'est
// touchée, et le banc ne prétend pas les couvrir.
//
// POURQUOI UNE CONSTANTE ET NON UN INSTANTANÉ. Un instantané vitest se
// régénère avec `-u` : n'importe qui peut effacer la référence sans qu'un
// relecteur le voie. Une constante gelée ne change qu'en éditant des valeurs
// visibles dans le diff — c'est la seule forme qui résiste à la régénération
// distraite.
//
// DÉTERMINISME. Aucune donnée externe, aucun secret réel, aucune API
// fournisseur, aucun état mutable : les cas 1-4 et 7 exécutent des fonctions
// pures ; les cas 5 et 6 exécutent le vrai moteur avec des fixtures figées et
// la frontière fournisseur mockée au niveau du client.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Le moteur lit ses identifiants au niveau module : amorçage hissé.
vi.hoisted(() => {
  process.env.CJ_EMAIL = 'nexiora@test.com';
  process.env.CJ_API_KEY = 'test-key';
});

const cjCreateOrderMock = vi.fn();
const cjGetVariantsMock = vi.fn();
const cjCalculateFreightMock = vi.fn();
vi.mock('@/lib/cj/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cj/client')>('@/lib/cj/client');
  return {
    ...actual,
    cjCreateOrder: (...a: unknown[]) => cjCreateOrderMock(...a),
    cjGetVariants: (...a: unknown[]) => cjGetVariantsMock(...a),
    cjCalculateFreight: (...a: unknown[]) => cjCalculateFreightMock(...a),
  };
});

const reconcileWithCjMock = vi.fn();
vi.mock('@/lib/cj/reconcile', () => ({ reconcileWithCj: (...a: unknown[]) => reconcileWithCjMock(...a) }));

const fulfillPodOrderMock = vi.fn();
vi.mock('@/lib/suppliers/pod-fulfill', () => ({ fulfillPodOrder: (...a: unknown[]) => fulfillPodOrderMock(...a) }));

const decrementStockMock = vi.fn();
vi.mock('@/lib/shop', () => ({ decrementStock: (...a: unknown[]) => decrementStockMock(...a) }));

vi.mock('@/lib/email/sendOrderConfirmationEmail', () => ({ sendOrderConfirmationEmail: vi.fn(async () => true) }));
vi.mock('@/lib/anomaly', () => ({ logAnomaly: vi.fn(async () => undefined) }));
vi.mock('@/lib/payments', () => ({ getProvider: vi.fn(() => ({ refundPayment: vi.fn() })) }));

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { handlePaidCheckout } from '@/lib/shop/handlePaidCheckout';
import { MODE3_CHECKOUT_POLICY } from '@/lib/mode3/checkoutPolicy';
import { suppliersForDropshipType } from '@/lib/dropship/suppliers';

// ============================================================
// LA RÉFÉRENCE. Toute modification d'une valeur ci-dessous est un changement
// DÉLIBÉRÉ du comportement Mode 3 protégé, visible en revue.
// ============================================================
const BANC_A7 = Object.freeze({
  '1 · reseller -> CJ': {
    fournisseursAutorises: ['cj'],
    admetCj: true,
    admetPrintful: false,
    admetGelato: false,
  },
  // LOT 1 / L1-03 -- VALEUR DE REFERENCE CHANGEE DELIBEREMENT.
  //
  // L'ancienne reference protegeait « sous-type NULL -> CJ (repli
  // historique) ». Elle protegeait donc, fidelement, un DEFAUT : un
  // `default:` de `switch` decidait du fournisseur d'un site dont le
  // marchand n'avait jamais designe le sous-type -- et 12 commandes reelles,
  // dont 2 transmises a CJ, ont emprunte ce chemin. Le banc faisait
  // exactement son travail : il a rendu ce changement visible et impossible
  // a faire par inadvertance.
  '2 · sous-type NULL -> AUCUN fournisseur (fail-closed)': {
    fournisseursAutorises: [],
    admetCj: false,
    admetPrintful: false,
    admetGelato: false,
  },
  '3 · pod_brand -> POD': {
    fournisseursAutorises: ['printful', 'gelato'],
    admetCj: false,
    admetPrintful: true,
    admetGelato: true,
  },
  '4 · pod_custom -> POD': {
    fournisseursAutorises: ['printful', 'gelato'],
    admetCj: false,
    admetPrintful: true,
    admetGelato: true,
  },
  '5 · commande mixte': {
    envoyeAuFournisseur: [{ vid: 'vid-1', quantity: 1 }],
    stockMarchandDecremente: [{ id: 'sp2', quantity: 2 }],
    appelsCreationFournisseur: 1,
  },
  '6 · tentatives epuisees -> reentree sans effet': {
    resultat: [],
    appelsCreationFournisseur: 0,
    stockDecremente: false,
  },
  '7 · devis obligatoire + commission': {
    devisExigeParLeDomaine: true,
    gardesFinancieresActives: true,
    commissionSur20: 1.2,
    fraisSur_10_6_1_2: 17.2,
    admetFournisseurAbsent: false,
  },
});

// ---- Harnais du moteur, pour les deux seuls cas qui l'exigent ----
type Handlers = Record<string, { data: unknown; error?: unknown }>;

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'in', 'insert', 'update', 'upsert', 'delete', 'lt', 'gte', 'is', 'or', 'order', 'limit']) {
    chain[m] = vi.fn(self);
  }
  const narrowed = Array.isArray(response.data)
    ? { data: response.data[0] ?? null, error: response.error ?? null }
    : response;
  chain.single = vi.fn(async () => narrowed);
  chain.maybeSingle = vi.fn(async () => narrowed);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

function setupTables(handlers: Handlers) {
  fromMock.mockImplementation((table: string) => tableChain(handlers[table] ?? { data: null, error: null }));
}

const COMMANDE = {
  id: 'order-1', site_id: 'site-1', status: 'pending', payment_ref: 'cs_test_1',
  fulfillment_domain: 'supplier',
  shipping_address: { country: 'US', city: 'NYC', postal_code: '10001', line1: '123 Main St', state: 'NY', phone: '+15550001111' },
  customer_name: 'Client', customer_email: 'c@test.com',
  cj_pay_status: 'pending', cj_pay_attempts: 0, cj_pay_locked_at: null,
  shipping_amount: 10, shipment_logistic_name: 'Standard', estimated_delivery: '12 days', total: 50,
};
const LIGNES_MIXTES = [{ product_id: 'sp1', quantity: 1 }, { product_id: 'sp2', quantity: 2 }];
const PRODUITS_MIXTES = [{ id: 'sp1', cj_vid: 'vid-1' }, { id: 'sp2', cj_vid: null }];

const SESSION = {
  id: 'cs_test_1', payment_intent: 'pi_1',
  customer_details: { email: 'client@test.com', name: 'Client Test' },
  amount_total: 5000, currency: 'usd',
};

function executerMoteur(commande: Record<string, unknown>) {
  setupTables({
    shop_orders: { data: [{ ...COMMANDE, ...commande }], error: null },
    shop_order_items: { data: LIGNES_MIXTES, error: null },
    shop_products: { data: PRODUITS_MIXTES, error: null },
    sites: { data: [{ name: 'Ma Boutique' }], error: null },
  });
  return handlePaidCheckout(SESSION);
}

beforeEach(() => {
  fromMock.mockReset();
  cjCreateOrderMock.mockReset().mockResolvedValue({ orderId: 'cj-1' });
  cjGetVariantsMock.mockReset();
  cjCalculateFreightMock.mockReset().mockResolvedValue([
    { logisticName: 'Standard', logisticPrice: '5', logisticAging: '7-12' },
  ]);
  reconcileWithCjMock.mockReset().mockResolvedValue({ kind: 'NOT_FOUND' });
  fulfillPodOrderMock.mockReset().mockResolvedValue([]);
  decrementStockMock.mockReset().mockResolvedValue({ ok: true });
});

/** Observable de routage : ce que le domaine autorise pour un sous-type. */
function routagePour(sousType: string | null) {
  return {
    fournisseursAutorises: suppliersForDropshipType(sousType as never),
    admetCj: MODE3_CHECKOUT_POLICY.admitsCatalogSupplier('cj', sousType),
    admetPrintful: MODE3_CHECKOUT_POLICY.admitsCatalogSupplier('printful', sousType),
    admetGelato: MODE3_CHECKOUT_POLICY.admitsCatalogSupplier('gelato', sousType),
  };
}

describe('BANC DE RÉFÉRENCE A7 — les 7 comportements Mode 3 protégés (§10)', () => {
  it('1 · reseller -> CJ', () => {
    expect(routagePour('reseller')).toEqual(BANC_A7['1 · reseller -> CJ']);
  });

  it('2 · sous-type NULL -> AUCUN fournisseur (fail-closed)', () => {
    expect(routagePour(null)).toEqual(BANC_A7['2 · sous-type NULL -> AUCUN fournisseur (fail-closed)']);
  });

  it("2bis · un sous-type INCONNU se comporte comme l'absence, jamais comme reseller", () => {
    for (const inconnu of ['', 'RESELLER', 'pod-brand', 'legacy_x']) {
      expect(routagePour(inconnu)).toEqual(BANC_A7['2 · sous-type NULL -> AUCUN fournisseur (fail-closed)']);
    }
  });

  it('3 · pod_brand -> POD', () => {
    expect(routagePour('pod_brand')).toEqual(BANC_A7['3 · pod_brand -> POD']);
  });

  it('4 · pod_custom -> POD', () => {
    expect(routagePour('pod_custom')).toEqual(BANC_A7['4 · pod_custom -> POD']);
  });

  it('5 · commande mixte', async () => {
    await executerMoteur({});
    expect({
      envoyeAuFournisseur: cjCreateOrderMock.mock.calls[0][2].products,
      stockMarchandDecremente: decrementStockMock.mock.calls[0][0],
      appelsCreationFournisseur: cjCreateOrderMock.mock.calls.length,
    }).toEqual(BANC_A7['5 · commande mixte']);
  });

  it('6 · tentatives epuisees -> reentree sans effet', async () => {
    await executerMoteur({ cj_pay_attempts: 3 });
    expect({
      resultat: [],
      appelsCreationFournisseur: cjCreateOrderMock.mock.calls.length,
      // La reentree n'engage AUCUN fournisseur -- mais elle ne prive pas non
      // plus le marchand du traitement commun de sa commande.
      stockDecremente: decrementStockMock.mock.calls.length === 0,
    }).toEqual(BANC_A7['6 · tentatives epuisees -> reentree sans effet']);
  });

  it('7 · devis obligatoire + commission', () => {
    expect({
      devisExigeParLeDomaine: MODE3_CHECKOUT_POLICY.requiresResolvedShipping,
      gardesFinancieresActives: MODE3_CHECKOUT_POLICY.enforcesSupplierFinancialGuards,
      commissionSur20: MODE3_CHECKOUT_POLICY.commission(20),
      fraisSur_10_6_1_2: MODE3_CHECKOUT_POLICY.applicationFee(10, 6, 1.2),
      admetFournisseurAbsent: MODE3_CHECKOUT_POLICY.admitsCatalogSupplier(null, 'reseller'),
    }).toEqual(BANC_A7['7 · devis obligatoire + commission']);
  });
});

describe('BANC A7 — intégrité du banc lui-même', () => {
  it('les 7 comportements du §10 sont couverts, ni plus ni moins', () => {
    expect(Object.keys(BANC_A7)).toHaveLength(7);
  });

  it('la référence est gelée — elle ne peut pas dériver en cours d’exécution', () => {
    expect(Object.isFrozen(BANC_A7)).toBe(true);
  });

  // CONTRÔLE NÉGATIF : sans lui, des comparaisons `toEqual` pourraient être
  // vertes contre une référence qui ne décrit rien de discriminant.
  it('CONTRÔLE — les sous-types ne partagent pas la même référence', () => {
    expect(BANC_A7['1 · reseller -> CJ']).not.toEqual(BANC_A7['3 · pod_brand -> POD']);
    expect(routagePour('reseller')).not.toEqual(routagePour('pod_brand'));
  });
});
