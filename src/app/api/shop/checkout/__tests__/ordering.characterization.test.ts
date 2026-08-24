// src/app/api/shop/checkout/__tests__/ordering.characterization.test.ts
//
// PHASE 5 du chantier de séparation Mode 2 / Mode 3 — préalable au vecteur F5.
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// ============================================================
// CARACTÉRISATION DE L'ORDRE ACTUEL. AUCUNE MODIFICATION.
//
// L'audit de la phase 5 a mesuré que le harnais ne pouvait PAS distinguer un
// réordonnancement des vérifications du checkout :
//
//   · `checkCatalogStock` est mocké dans les deux fichiers de test existants ;
//   · aucune assertion d'ordre n'existait (0 `invocationCallOrder`) ;
//   · la temporisation du quota fournisseur n'était couverte nulle part —
//     ni ici, ni dans catalog-stock.test.ts.
//
// Autrement dit : déplacer l'une de ces trois étapes aurait laissé la suite
// verte, POUR LA MAUVAISE RAISON. Ce fichier ferme ce trou AVANT que F5 ne
// touche quoi que ce soit, conformément à la règle du plan §13 :
// « Non-régression — à établir AVANT chaque modification importante ».
//
// CE QUI EST CARACTÉRISÉ ICI EST LE COMPORTEMENT ACTUEL, PAS UN COMPORTEMENT
// SOUHAITÉ. Si l'arbitrage de F5 décide de réordonner, ces tests devront être
// modifiés EXPLICITEMENT — c'est précisément leur intérêt : rendre le
// changement visible au lieu de le laisser passer en silence.
//
// POURQUOI L'ORDRE COMPTE — `checkout/route.ts:149-152` le dit en clair :
// « CJ limite a 1 req/s : on laisse retomber le quota apres la verif de
// stock ». La temporisation est POSITIONNÉE ENTRE les appels de stock et
// l'appel de fret. Déplacer la vérification de stock hors de cet intervalle
// exposerait le Mode 3 à un rejet de quota fournisseur.
//
// Fichier de test autonome : il mocke `resolveShipping`, ce que les deux
// fichiers existants ne font pas (ils passent par un registre fournisseur
// vide et le repli `shipping_cache`). Aucun de ces deux fichiers n'est
// modifié — le harnais y est dupliqué plutôt que factorisé, pour ne pas
// toucher aux tests existants.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const checkStockMock = vi.fn();
vi.mock('@/lib/shop', () => ({ checkStock: (...a: unknown[]) => checkStockMock(...a) }));

const checkCatalogStockMock = vi.fn();
vi.mock('@/lib/mode3/catalogStock', () => ({
  checkCatalogStock: (...a: unknown[]) => checkCatalogStockMock(...a),
}));

// Mocké ICI et nulle part ailleurs : c'est ce qui rend l'ordre observable.
const buildSupplierGroupsMock = vi.fn();
const resolveShippingMock = vi.fn();
vi.mock('@/lib/shop/quote/resolveShipping', () => ({
  buildSupplierGroups: (...a: unknown[]) => buildSupplierGroupsMock(...a),
  resolveShipping: (...a: unknown[]) => resolveShippingMock(...a),
}));

const createCheckoutMock = vi.fn();
vi.mock('@/lib/payments', () => ({
  getProvider: () => ({ createCheckout: (...a: unknown[]) => createCheckoutMock(...a) }),
}));

vi.mock('@/lib/suppliers/registry', () => ({ suppliersWithCapability: () => [] }));

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

type Handlers = Record<string, { data: unknown; error?: unknown }>;

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.in = vi.fn(self);
  chain.insert = vi.fn(self);
  chain.is = vi.fn(self);
  const narrowed = Array.isArray(response.data)
    ? { data: response.data[0] ?? null, error: response.error ?? null }
    : response;
  chain.single = vi.fn(async () => narrowed);
  chain.maybeSingle = vi.fn(async () => narrowed);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { POST } from '../route';

function setupTables(handlers: Handlers, fallback: { data: unknown; error?: unknown } = { data: null, error: null }) {
  const chains = new Map<string, ReturnType<typeof tableChain>>();
  fromMock.mockImplementation((table: string) => {
    if (!chains.has(table)) chains.set(table, tableChain(handlers[table] ?? fallback));
    return chains.get(table)!;
  });
  return chains;
}

function req(body: unknown) {
  return new Request('https://woorri.test/api/shop/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const SITE_MODE3 = {
  id: 'site-1', payment_provider: 'stripe', payment_account_id: 'acct_1',
  shipping_flat: 5, mode: 3, cj_margin_percent: null, cj_round_mode: null,
};

const SITE_MODE2 = { ...SITE_MODE3, mode: 2 };
/** Mode 3 POD BRAND : le cloisonnement par sous-type interdit CJ. */
const SITE_MODE3_POD = { ...SITE_MODE3, dropship_type: 'pod_brand' };

/** Panier fournisseur nominal : traverse stock catalogue, temporisation et devis. */
function setupPanierFournisseur() {
  setupTables({
    sites: { data: SITE_MODE3, error: null },
    catalog_products: {
      data: [{ id: 'cp-1', price: 10, currency: 'usd', supplier_id: 'cj', supplier_product_id: 'vid-1' }],
      error: null,
    },
    site_catalog_selections: { data: null, error: null },
    shop_orders: { data: { id: 'order-1' }, error: null },
    shop_order_items: { data: [{ id: 'item-1' }], error: null },
  });
}

// Le vrai `setTimeout` ferait durer chaque cas 1,1 s. Le remplacer par un
// déclenchement immédiat conserve l'ORDRE et le DÉLAI DEMANDÉ — les deux
// seules choses caractérisées ici — sans attendre réellement.
let setTimeoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fromMock.mockReset();
  checkStockMock.mockReset().mockResolvedValue({ ok: true });
  checkCatalogStockMock.mockReset().mockResolvedValue({ ok: true });
  buildSupplierGroupsMock.mockReset().mockResolvedValue({ cj: [{ supplier_product_id: 'vid-1', quantity: 1 }] });
  resolveShippingMock.mockReset().mockResolvedValue({
    source: 'cache', amount: 6, tiers: null, selectedTier: null,
    logisticName: 'CJPacket', estimatedMinDays: 5, estimatedMaxDays: 10,
  });
  logAnomalyMock.mockReset();
  createCheckoutMock.mockReset().mockResolvedValue({
    url: 'https://checkout.stripe.test/c/pay/cs_test_1',
    orderId: 'cs_test_1',
  });
  setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
    fn();
    return 0;
  }) as unknown as typeof setTimeout);
});

afterEach(() => {
  setTimeoutSpy.mockRestore();
});

/** Rang d'invocation de la temporisation du quota fournisseur (1100 ms).
 *  Filtré sur le délai : l'environnement de test peut poser d'autres minuteurs. */
function rangAttenteQuota(): number {
  const i = setTimeoutSpy.mock.calls.findIndex((args: unknown[]) => args[1] === 1100);
  expect(i, 'aucune temporisation de 1100 ms observée — la caractérisation serait vide').toBeGreaterThanOrEqual(0);
  return setTimeoutSpy.mock.invocationCallOrder[i];
}

describe('checkout — ORDRE ACTUEL des vérifications (caractérisation, phase 5)', () => {
  it('les trois étapes sont réellement exécutées — sans quoi les assertions d’ordre seraient vides', async () => {
    setupPanierFournisseur();
    await POST(req({ slug: 'boutique', items: [{ id: 'catalog-cp-1::vid-1', quantity: 1 }], countryCode: 'US' }));

    expect(checkCatalogStockMock).toHaveBeenCalledTimes(1);
    expect(buildSupplierGroupsMock).toHaveBeenCalledTimes(1);
    expect(resolveShippingMock).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy.mock.calls.filter((a: unknown[]) => a[1] === 1100).length).toBe(1);
  });

  it('ORDRE : checkCatalogStock PUIS temporisation du quota PUIS resolveShipping', async () => {
    setupPanierFournisseur();
    await POST(req({ slug: 'boutique', items: [{ id: 'catalog-cp-1::vid-1', quantity: 1 }], countryCode: 'US' }));

    const stock = checkCatalogStockMock.mock.invocationCallOrder[0];
    const attente = rangAttenteQuota();
    const groupes = buildSupplierGroupsMock.mock.invocationCallOrder[0];
    const devis = resolveShippingMock.mock.invocationCallOrder[0];

    expect(
      stock,
      'la verification de stock catalogue doit precéder la temporisation du quota fournisseur'
    ).toBeLessThan(attente);
    expect(
      attente,
      "la temporisation est POSITIONNEE ENTRE le stock et le fret : c'est ce qui laisse retomber le quota fournisseur (route.ts:149-152). La deplacer exposerait le Mode 3 a un rejet de quota."
    ).toBeLessThan(groupes);
    expect(groupes).toBeLessThan(devis);
  });

  it('la temporisation du quota vaut exactement 1100 ms', async () => {
    setupPanierFournisseur();
    await POST(req({ slug: 'boutique', items: [{ id: 'catalog-cp-1::vid-1', quantity: 1 }], countryCode: 'US' }));

    const delais = setTimeoutSpy.mock.calls.map((a: unknown[]) => a[1]);
    expect(delais, `délais observés : ${JSON.stringify(delais)}`).toContain(1100);
  });

  it('APERCU : ni verification de stock catalogue, ni temporisation du quota', async () => {
    setupPanierFournisseur();
    await POST(req({ slug: 'boutique', items: [{ id: 'catalog-cp-1::vid-1', quantity: 1 }], countryCode: 'US', preview: true }));

    expect(checkCatalogStockMock).not.toHaveBeenCalled();
    expect(
      setTimeoutSpy.mock.calls.filter((a: unknown[]) => a[1] === 1100).length,
      "sans verification de stock, il n'y a aucun quota a laisser retomber : la temporisation n'a plus d'objet"
    ).toBe(0);
  });

  it('APERCU : le devis de livraison, lui, reste calculé', async () => {
    setupPanierFournisseur();
    await POST(req({ slug: 'boutique', items: [{ id: 'catalog-cp-1::vid-1', quantity: 1 }], countryCode: 'US', preview: true }));

    expect(resolveShippingMock).toHaveBeenCalledTimes(1);
  });
});


// ============================================================
// F3 + F5 — D2 DOIT PRÉCÉDER TOUT APPEL FOURNISSEUR
// ============================================================
// Cause racine commune aux deux vecteurs : l'admission D2 s'exécutait APRÈS
// la vérification de stock catalogue (F5) ET après le devis de livraison
// (F3). Un panier qu'aucun moteur ne pourra jamais exécuter consommait donc
// deux appels fournisseur avant d'être refusé.
//
// Ces tests sont écrits AVANT la modification de production et échouent sur
// l'état actuel : c'est ce qui prouve qu'ils mesurent le changement, et non
// une propriété déjà vraie.

const PANIER_CATALOGUE = [{ id: 'catalog-cp-1::vid-1', quantity: 1 }];

function setupSite(site: unknown) {
  setupTables({
    sites: { data: site, error: null },
    catalog_products: {
      data: [{ id: 'cp-1', price: 10, currency: 'usd', supplier_id: 'cj', supplier_product_id: 'vid-1' }],
      error: null,
    },
    site_catalog_selections: { data: null, error: null },
    shop_orders: { data: { id: 'order-1' }, error: null },
    shop_order_items: { data: [{ id: 'item-1' }], error: null },
  });
}

describe('F5 — le domaine marchand ne consomme aucun appel de stock fournisseur', () => {
  it('Mode 2 + produit de catalogue -> 409 AVANT checkCatalogStock', async () => {
    setupSite(SITE_MODE2);
    const res = await POST(req({ slug: 'boutique', items: PANIER_CATALOGUE, countryCode: 'US' }));

    expect(res.status).toBe(409);
    expect(
      checkCatalogStockMock,
      "D2 refuse ce panier : aucun creneau de quota fournisseur ne doit etre consomme pour une vente impossible"
    ).not.toHaveBeenCalled();
  });
});

describe('F3 — le domaine marchand ne consomme aucun devis fournisseur', () => {
  it('Mode 2 + produit de catalogue -> 409 AVANT resolveShipping', async () => {
    setupSite(SITE_MODE2);
    const res = await POST(req({ slug: 'boutique', items: PANIER_CATALOGUE, countryCode: 'US' }));

    expect(res.status).toBe(409);
    expect(buildSupplierGroupsMock).not.toHaveBeenCalled();
    expect(resolveShippingMock).not.toHaveBeenCalled();
  });

  it('APERCU Mode 2 : le devis fournisseur non plus — l\'apercu contournait la garde', async () => {
    setupSite(SITE_MODE2);
    await POST(req({ slug: 'boutique', items: PANIER_CATALOGUE, countryCode: 'US', preview: true }));

    expect(
      resolveShippingMock,
      "l'apercu n'appelle pas checkCatalogStock mais appelait BIEN resolveShipping : c'etait le chemin fournisseur restant du Mode 2"
    ).not.toHaveBeenCalled();
  });

  it('la refus est trace avec l\'anomalie D2 existante, pas un nouveau type', async () => {
    setupSite(SITE_MODE2);
    await POST(req({ slug: 'boutique', items: PANIER_CATALOGUE, countryCode: 'US' }));

    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'catalog_supplier_not_eligible' })
    );
  });
});

describe('Mode 3 — cloisonnement par sous-type : refus precoce, sans appel fournisseur', () => {
  it('pod_brand + produit CJ -> 409 AVANT tout appel fournisseur', async () => {
    setupSite(SITE_MODE3_POD);
    const res = await POST(req({ slug: 'boutique', items: PANIER_CATALOGUE, countryCode: 'US' }));

    expect(res.status).toBe(409);
    expect(checkCatalogStockMock).not.toHaveBeenCalled();
    expect(resolveShippingMock).not.toHaveBeenCalled();
  });
});

describe('Mode 3 admissible — ordre et devis strictement inchanges', () => {
  it('reseller + produit CJ : les 4 etapes, dans le meme ordre, temporisation comprise', async () => {
    setupSite(SITE_MODE3);
    await POST(req({ slug: 'boutique', items: PANIER_CATALOGUE, countryCode: 'US' }));

    expect(checkCatalogStockMock).toHaveBeenCalledTimes(1);
    expect(resolveShippingMock).toHaveBeenCalledTimes(1);

    const stock = checkCatalogStockMock.mock.invocationCallOrder[0];
    const attente = rangAttenteQuota();
    const devis = resolveShippingMock.mock.invocationCallOrder[0];
    expect(stock).toBeLessThan(attente);
    expect(
      attente,
      'la temporisation du quota fournisseur doit RESTER entre le stock et le fret apres la fermeture F3/F5'
    ).toBeLessThan(devis);
  });

  it('le devis rendu au checkout est celui de resolveShipping, inchange', async () => {
    setupSite(SITE_MODE3);
    await POST(req({ slug: 'boutique', items: PANIER_CATALOGUE, countryCode: 'US' }));
    expect(resolveShippingMock).toHaveBeenCalledTimes(1);
    expect(createCheckoutMock).toHaveBeenCalled();
  });
});


// ============================================================
// DÉFENSE EN PROFONDEUR — les deux gardes D2 ne sont pas redondantes
// ============================================================
// La garde hissée en phase 5 statue sur une lecture par lot
// (`.in('id', ...)`) ; la garde de phase 4 statue sur la lecture qui sert
// REELLEMENT au calcul du prix (`.eq('id', ...).maybeSingle()`). Deux
// lectures distinctes, séparées dans le temps par une vérification de stock
// et un devis fournisseur : rien ne garantit qu'elles voient la même ligne.
//
// Sans ce test, la garde de phase 4 était devenue INVÉRIFIABLE : la garde
// précoce l'ombrage sur tous les autres cas, et sa suppression laissait la
// suite entièrement verte (mutation M27). Une protection que plus rien ne
// prouve n'est plus une protection.
//
// Le fixture fait diverger les deux lectures — l'entrée par lot porte le
// produit admissible, la lecture unitaire en renvoie un autre. C'est le
// scénario exact contre lequel une défense en profondeur existe : la ligne
// a changé entre les deux lectures.

describe('D2 — défense en profondeur : la garde tardive refuse ce que la précoce a laissé passer', () => {
  it('lectures divergentes -> 409, ALORS QUE la garde précoce avait admis le panier', async () => {
    setupTables({
      sites: { data: SITE_MODE3, error: null },
      // data[0] -> ce que rend `.maybeSingle()` (lecture de la passe de prix) :
      //            fournisseur NON admis par le sous-type reseller.
      // data[1] -> la ligne trouvée par `.in()` sur l'id réel du panier :
      //            fournisseur admis. La garde précoce passe donc.
      catalog_products: {
        data: [
          { id: 'autre', price: 10, currency: 'usd', supplier_id: 'printful', supplier_product_id: 'vid-x' },
          { id: 'cp-1', price: 10, currency: 'usd', supplier_id: 'cj', supplier_product_id: 'vid-1' },
        ],
        error: null,
      },
      site_catalog_selections: { data: null, error: null },
      shop_orders: { data: { id: 'order-1' }, error: null },
      shop_order_items: { data: [{ id: 'item-1' }], error: null },
    });

    const res = await POST(req({ slug: 'boutique', items: PANIER_CATALOGUE, countryCode: 'US' }));

    // Preuve que la garde PRÉCOCE a laissé passer : les deux appels
    // fournisseur ont bien eu lieu. Sans cela, le 409 ci-dessous pourrait
    // venir de la garde précoce et ce test ne prouverait rien.
    expect(checkCatalogStockMock, 'la garde précoce devait admettre ce panier').toHaveBeenCalledTimes(1);
    expect(resolveShippingMock, 'la garde précoce devait admettre ce panier').toHaveBeenCalledTimes(1);

    expect(
      res.status,
      "seule la garde D2 de la passe de prix peut refuser ici : si elle est supprimée, ce panier est encaissé alors qu'aucun moteur ne peut l'exécuter"
    ).toBe(409);
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'catalog_supplier_not_eligible' })
    );
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });
});
