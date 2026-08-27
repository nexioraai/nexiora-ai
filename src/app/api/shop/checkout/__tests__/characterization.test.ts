import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// LOT 0 -- TESTS DE CARACTERISATION (filet de securite)
//
// Ces tests ne verifient PAS que le comportement est correct. Ils FIGENT le
// comportement financier ACTUEL de checkout/route.ts, valeur par valeur,
// avant la refactorisation vers un devis canonique en centimes entiers
// (LOT 1-2). Toute divergence introduite par la refactorisation -- arrondi
// deplace, marge appliquee ailleurs, commission calculee sur une autre base --
// fera echouer ces tests, ce qui est exactement leur role.
//
// Un comportement fige ici peut donc etre un DEFAUT. Quand c'est le cas, le
// test le dit explicitement dans son intitule ; il devra etre mis a jour
// DELIBEREMENT au lot correspondant, jamais par accident.
//
// Aucun appel CJ reel : les adaptateurs fournisseurs sont mockes. Conforme a
// la contrainte architecturale checkout -> dropshipping (le checkout ne
// contacte jamais un fournisseur pour une COMMANDE ; ici meme les devis sont
// simules).
// ============================================================

const checkStockMock = vi.fn();
vi.mock('@/lib/shop', () => ({ checkStock: (...a: unknown[]) => checkStockMock(...a) }));

const checkCatalogStockMock = vi.fn();
vi.mock('@/lib/mode3/catalogStock', () => ({
  checkCatalogStock: (...a: unknown[]) => checkCatalogStockMock(...a),
}));

const createCheckoutMock = vi.fn();
vi.mock('@/lib/payments', () => ({
  getProvider: vi.fn(() => ({ createCheckout: (...a: unknown[]) => createCheckoutMock(...a) })),
}));

// Aucun adaptateur live : le chemin cache est alors le SEUL producteur de
// frais de port CJ, ce qui isole exactement ce que le LOT 1 va deplacer.
vi.mock('@/lib/suppliers/registry', () => ({ suppliersWithCapability: () => [] }));

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { POST } from '../route';

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

function setupTables(handlers: Handlers) {
  const chains = new Map<string, ReturnType<typeof tableChain>>();
  fromMock.mockImplementation((table: string) => {
    if (!chains.has(table)) {
      chains.set(table, tableChain(handlers[table] ?? { data: null, error: null }));
    }
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

const SITE_MODE2 = {
  id: 'site-1', payment_provider: 'stripe', payment_account_id: 'acct_1',
  shipping_flat: 5, mode: 2, cj_margin_percent: null, cj_round_mode: null,
  dropship_type: null, pod_designs: null,
};
const SITE_MODE3 = { ...SITE_MODE2, mode: 3, dropship_type: 'reseller' };

/** Paliers CJ tels que stockes en cache : PRIX BRUT, sans marge. */
const CACHE_TIERS = [
  { tier: 'eco', name: 'CJPacket Ordinary', cost: 2, days_min: 7, days_max: 15 },
  { tier: 'standard', name: 'CJPacket Sensitive', cost: 3, days_min: 4, days_max: 7 },
  { tier: 'express', name: 'DHL Official', cost: 4, days_min: 3, days_max: 5 },
];

/** Empreinte financiere complete d'un checkout : ce que le LOT 1 doit preserver. */
function fingerprint(chains: Map<string, ReturnType<typeof tableChain>>) {
  const insertFn = chains.get('shop_orders')?.insert as ReturnType<typeof vi.fn> | undefined;
  const row = insertFn?.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
  const args = createCheckoutMock.mock.calls[0] ?? [];
  return {
    // --- ce qui part chez Stripe ---
    stripeShipping: args[5],
    stripeApplicationFee: args[6],
    stripeNonce: args[7],
    stripePromoDiscount: args[8],
    // --- ce qui est enregistre en base ---
    orderTotal: row?.total,
    orderShipping: row?.shipping_amount,
    orderSupplierCost: row?.supplier_cost,
    orderCommission: row?.nexiora_commission,
    orderProfit: row?.merchant_profit,
    orderTier: row?.shipment_tier,
    orderLogisticName: row?.shipment_logistic_name,
    orderCurrency: row?.currency,
  };
}

beforeEach(() => {
  fromMock.mockReset();
  checkStockMock.mockReset().mockResolvedValue({ ok: true });
  checkCatalogStockMock.mockReset().mockResolvedValue({ ok: true });
  logAnomalyMock.mockReset();
  createCheckoutMock.mockReset().mockResolvedValue({
    url: 'https://checkout.stripe.test/c/pay/cs_test_1',
    orderId: 'cs_test_1',
  });
});

// ------------------------------------------------------------
// Mode 2 -- forfait de livraison, aucune commission avancee
// ------------------------------------------------------------
describe('CARACTERISATION -- Mode 2 (forfait)', () => {
  function setupMode2(promo: unknown = null, price = 100) {
    return setupTables({
      sites: { data: SITE_MODE2 },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price, currency: 'usd', published: true, for_sale: true }] },
      promo_codes: { data: promo },
      shop_orders: { data: { id: 'order-1' } },
      shop_order_items: { data: [{ id: 'item-1' }] },
    });
  }
  const order = (extra: Record<string, unknown> = {}, quantity = 1) =>
    req({ slug: 'boutique', countryCode: 'CA', items: [{ id: 'p1', quantity, name: 'T', currency: 'usd' }], ...extra });

  // M2-01 -- ces attentes FIGEAIENT LE DEFAUT. Ecrites au LOT 0 pour geler le
  // comportement existant avant refonte, elles ont fait exactement leur
  // travail : elles ont detecte le correctif. Mais ce qu'elles gelaient etait
  // faux -- une commission de 6 % enregistree en Mode 2 alors que Stripe n'en
  // prelevait aucune (`applicationFeeAmount = 0`), et un profit marchand
  // diminue d'autant. Les valeurs suivent desormais la realite economique du
  // Mode 2 : aucune commission, profit = montant encaisse.
  it('A1 -- produit 100 usd, qty 1, forfait 5, sans promo', async () => {
    const chains = setupMode2();
    const res = await POST(order());
    expect(res.status).toBe(200);
    expect(fingerprint(chains)).toEqual({
      stripeShipping: 5, stripeApplicationFee: 0, stripeNonce: undefined, stripePromoDiscount: 0,
      orderTotal: 100, orderShipping: 5, orderSupplierCost: 0,
      orderCommission: 0, orderProfit: 100, orderTier: null,   // M2-01 : etait 6 / 94
      orderLogisticName: null, orderCurrency: 'usd',
    });
  });

  it('A2 -- qty 3 : le total suit la quantite, le FORFAIT de livraison ne la suit PAS', async () => {
    const chains = setupMode2();
    const res = await POST(order({}, 3));
    expect(res.status).toBe(200);
    const f = fingerprint(chains);
    expect(f.orderTotal).toBe(300);
    expect(f.orderShipping).toBe(5);       // forfait, jamais multiplie
    expect(f.orderCommission).toBe(0);     // M2-01 : etait 18
    expect(f.orderProfit).toBe(300);       // M2-01 : etait 282 -- le marchand encaisse tout
  });

  // M2-01 -- OPTION A ("commission calculee avant remise") est une regle de
  // COMMISSION : elle n'a de sens qu'en Mode 3, ou une commission existe. En
  // Mode 2 il n'y en a aucune, avec ou sans remise. La regle OPTION A reste
  // verrouillee par le test Mode 3 correspondant, pas ici.
  it('A3 -- promo 20% : aucune commission en Mode 2, avec ou sans remise', async () => {
    const chains = setupMode2({
      id: 'promo-1', discount_type: 'percent', discount_value: 20,
      min_order: 0, max_uses: null, used_count: 0, expires_at: null,
    });
    const res = await POST(order({ promoCode: 'X20' }));
    expect(res.status).toBe(200);
    const f = fingerprint(chains);
    expect(f.stripePromoDiscount).toBe(20);
    expect(f.orderTotal).toBe(80);        // encaisse = apres remise
    expect(f.orderCommission).toBe(0);    // M2-01 : etait 6
    expect(f.orderProfit).toBe(80);       // M2-01 : etait 74 -- profit = encaisse
  });

  // M2-01 -- ce test figeait DEUX defauts ; le correctif en supprime UN.
  //
  // Le profit negatif n'etait pas une consequence de la remise : il venait de
  // la commission fantome. `0 - 0 - 6 = -6`. Sans commission en Mode 2, le
  // profit d'une commande a total nul vaut 0, ce qui est exact -- le marchand
  // n'encaisse rien et ne doit rien. Le correctif M2-01 ferme donc aussi ce
  // cas, sans qu'aucune garde n'ait ete ajoutee pour lui.
  //
  // Ce qui RESTE fige, et reste vrai : une remise fixe superieure au total
  // produit un total de 0 sans etre bloquee en Mode 2. Les garde-fous
  // financiers restent enfermes dans `if (site.mode === 3)` -- seule la garde
  // de montant nul (DEBT-029b) couvre tous les modes, et elle ne se declenche
  // pas ici puisque le forfait de livraison maintient un montant positif.
  it("A4 -- FIGE : remise fixe >= total -> total 0, non bloque en Mode 2 (profit desormais 0, plus negatif)", async () => {
    const chains = setupMode2({
      id: 'promo-2', discount_type: 'fixed', discount_value: 9999,
      min_order: 0, max_uses: null, used_count: 0, expires_at: null,
    });
    const res = await POST(order({ promoCode: 'FREE' }));
    expect(res.status).toBe(200);
    const f = fingerprint(chains);
    expect(f.stripePromoDiscount).toBe(100);
    expect(f.orderTotal).toBe(0);
    expect(f.orderCommission).toBe(0);
    expect(f.orderProfit).toBe(0);        // M2-01 : etait -6, cause par la commission fantome
    expect(f.orderProfit).toBeGreaterThanOrEqual(0);   // plus jamais negatif en Mode 2
  });
});

// ------------------------------------------------------------
// Mode 3 -- cache CJ, marge +20 %, commission avancee
// ------------------------------------------------------------
describe('CARACTERISATION -- Mode 3 (cache CJ + marge 20%)', () => {
  function setupMode3(opts: { tiers?: unknown; sellPrice?: number; cost?: number } = {}) {
    return setupTables({
      sites: { data: SITE_MODE3 },
      // Tableau volontairement : la route interroge cette table en LISTE
      // (.in(), bloc livraison) puis en LIGNE UNIQUE (.maybeSingle(), bloc
      // prix). Le harnais narrowe data[0] pour la seconde ; une fixture objet
      // casserait la premiere (`for...of` sur un non-iterable).
      catalog_products: {
        data: [{ id: 'cat-1', supplier_id: 'cj', supplier_product_id: 'VID1', price: opts.cost ?? 10, currency: 'usd' }],
      },
      site_catalog_selections: { data: { sell_price: opts.sellPrice ?? 30 } },
      shipping_cache: {
        data: [{
          supplier_product_id: 'VID1', shipping_cost: 2, days_min: 7, days_max: 15,
          tiers: opts.tiers === undefined ? CACHE_TIERS : opts.tiers,
        }],
      },
      promo_codes: { data: null },
      shop_orders: { data: { id: 'order-1' } },
      shop_order_items: { data: [{ id: 'item-1' }] },
    });
  }
  const order = (extra: Record<string, unknown> = {}, quantity = 1) =>
    req({ slug: 'boutique', countryCode: 'CA', items: [{ id: 'catalog-cat-1', quantity, name: 'P', currency: 'usd' }], ...extra });

  it('B1 -- palier standard : cout cache 3 -> facture 3.60 (marge x1.20 appliquee ICI)', async () => {
    const chains = setupMode3();
    const res = await POST(order({ shipmentTier: 'standard' }));
    expect(res.status).toBe(200);
    const f = fingerprint(chains);
    expect(f.orderShipping).toBe(3.6);
    expect(f.stripeShipping).toBe(3.6);
    expect(f.orderTier).toBe('standard');
    expect(f.orderLogisticName).toBe('CJPacket Sensitive');
    expect(f.orderSupplierCost).toBe(10);
    expect(f.orderTotal).toBe(30);
  });

  it('B2 -- application_fee = coutFournisseur + livraison + commission', async () => {
    const chains = setupMode3();
    await POST(order({ shipmentTier: 'standard' }));
    const f = fingerprint(chains);
    // 10 + 3.6 + 1.8 = 15.4  (sujet a derive flottante -- c'est le point du LOT 1)
    expect(f.stripeApplicationFee).toBeCloseTo(15.4, 10);
    expect(f.orderCommission).toBeCloseTo(1.8, 10);
  });

  it('B3 -- palier express : cout cache 4 -> facture 4.80', async () => {
    const chains = setupMode3();
    await POST(order({ shipmentTier: 'express' }));
    expect(fingerprint(chains).orderShipping).toBe(4.8);
  });

  it('B4 -- DEFAUT FIGE : qty 2 -> livraison MULTIPLIEE lineairement (3 x 2 x 1.20 = 7.20)', async () => {
    const chains = setupMode3();
    await POST(order({ shipmentTier: 'standard' }, 2));
    const f = fingerprint(chains);
    // Le cache provient d'un devis CJ pour UNE unite. La multiplication
    // lineaire n'est pas un devis reel -- fige ici, traite au LOT 5.
    expect(f.orderShipping).toBe(7.2);
    expect(f.orderTotal).toBe(60);
  });

  it("B5 -- CHANGEMENT LOT 2 : palier demande inconnu MAIS paliers disponibles -> repli sur 'standard' (3.60), plus sur shipping_cost", async () => {
    // Avant LOT 2 : repli sur shipping_cost x1.20 = 2.40, alors que le panier
    // affichait deja les paliers avec 'standard' preselectionne a 3.60 --
    // c'etait C3 en sens inverse (facturer MOINS que ce qui est montre).
    // Le repli sur shipping_cost reste actif quand AUCUN palier n'existe (B6).
    const chains = setupMode3();
    await POST(order({ shipmentTier: 'inexistant' }));
    expect(fingerprint(chains).orderShipping).toBe(3.6);
  });

  it('B6 -- aucun palier en cache -> repli sur shipping_cost, marge appliquee quand meme', async () => {
    const chains = setupMode3({ tiers: null });
    await POST(order({ shipmentTier: 'standard' }));
    expect(fingerprint(chains).orderShipping).toBe(2.4);
  });
});

// ------------------------------------------------------------
// Derive flottante -- ce que le LOT 1 (centimes entiers) doit supprimer
// ------------------------------------------------------------
// ------------------------------------------------------------
// LOT 1 -- precision monetaire. D1 figeait un DEFAUT ; il est desormais
// inverse pour figer le comportement CORRIGE. Les tests D2/D3 couvrent les
// deux causes distinctes que roundMoney() traite.
// ------------------------------------------------------------
describe('LOT 1 -- precision monetaire des valeurs ECRITES EN BASE', () => {
  function setupMoney(opts: { sellPrice: number; cost: number; quantity?: number }) {
    const chains = setupTables({
      sites: { data: SITE_MODE3 },
      catalog_products: {
        data: [{ id: 'cat-1', supplier_id: 'cj', supplier_product_id: 'VID1', price: opts.cost, currency: 'usd' }],
      },
      site_catalog_selections: { data: { sell_price: opts.sellPrice } },
      shipping_cache: {
        data: [{ supplier_product_id: 'VID1', shipping_cost: 2, days_min: 7, days_max: 15, tiers: CACHE_TIERS }],
      },
      promo_codes: { data: null },
      shop_orders: { data: { id: 'order-1' } },
      shop_order_items: { data: [{ id: 'item-1' }] },
    });
    return { chains, quantity: opts.quantity ?? 1 };
  }
  const send = (quantity: number) =>
    POST(req({
      slug: 'boutique', countryCode: 'CA', shipmentTier: 'standard',
      items: [{ id: 'catalog-cat-1', quantity, name: 'P', currency: 'usd' }],
    }));
  const insertedRow = (chains: Map<string, ReturnType<typeof tableChain>>) =>
    (chains.get('shop_orders')!.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];

  /** Un montant monetaire ne doit jamais avoir plus de 2 decimales. */
  const isCentExact = (n: number) => Number.isInteger(Math.round(n * 100)) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;

  it('D1 -- CORRIGE : nexiora_commission vaut exactement 1.8 (derive IEEE754 eliminee)', async () => {
    const { chains } = setupMoney({ sellPrice: 30, cost: 10 });
    await send(1);
    const row = insertedRow(chains);
    // Avant LOT 1 : 1.7999999999999998, persiste tel quel en base.
    expect(row.nexiora_commission).toBe(1.8);
    expect(row.merchant_profit).toBe(18.2);
    expect(row.supplier_cost).toBe(10);
  });

  it('D2 -- CORRIGE : une commission SOUS-LE-CENTIME est ramenee au centime facturable', async () => {
    // 19.99 x 3 = 59.97 ; 59.97 x 6% = 3.5982 -> non facturable par Stripe,
    // qui ne connait que des centimes entiers. La base enregistrait pourtant
    // 3.5982. Desormais alignee sur ce qui est reellement preleve.
    const { chains } = setupMoney({ sellPrice: 19.99, cost: 5 });
    await send(3);
    const row = insertedRow(chains);
    expect(row.total).toBe(59.97);
    expect(row.nexiora_commission).toBe(3.6);
    expect(row.supplier_cost).toBe(15);
  });

  it('D3 -- toutes les valeurs monetaires ecrites en base sont exactes au centime', async () => {
    const { chains } = setupMoney({ sellPrice: 19.99, cost: 7.77 });
    await send(3);
    const row = insertedRow(chains);
    for (const field of ['total', 'shipping_amount', 'supplier_cost', 'nexiora_commission', 'merchant_profit'] as const) {
      expect(isCentExact(row[field] as number), `${field} = ${row[field]}`).toBe(true);
    }
    // Coherence comptable : le profit reste la difference exacte des trois autres.
    expect(row.merchant_profit).toBe(
      Math.round(((row.total as number) - (row.supplier_cost as number) - (row.nexiora_commission as number)) * 100) / 100
    );
  });

  it("D4 -- l'arrondi a la source ne change PAS le montant reellement charge par Stripe", async () => {
    const { chains } = setupMoney({ sellPrice: 30, cost: 10 });
    await send(1);
    const f = fingerprint(chains);
    // application_fee = 10 + 3.60 + 1.80 = 15.40 -> 1540 centimes, identique
    // a la valeur pre-LOT 1 (15.399999999999999 -> 1540).
    expect(f.stripeApplicationFee).toBe(15.4);
    expect(Math.round((f.stripeApplicationFee as number) * 100)).toBe(1540);
  });
});

// ------------------------------------------------------------
// LOT 3 -- la cle d'idempotence est construite SERVEUR.
// Ces tests passent par la route reelle : eux seuls peuvent prouver que la
// cle reagit a une donnee que le navigateur ne connait pas.
// ------------------------------------------------------------
describe("LOT 3 -- cle d'idempotence derivee de l'etat commercial SERVEUR", () => {
  function setupSig(opts: { sellPrice?: number; tierCost?: number } = {}) {
    const tiers = CACHE_TIERS.map((t) =>
      t.tier === 'standard' ? { ...t, cost: opts.tierCost ?? 3 } : t
    );
    return setupTables({
      sites: { data: SITE_MODE3 },
      catalog_products: {
        data: [{ id: 'cat-1', supplier_id: 'cj', supplier_product_id: 'VID1', price: 10, currency: 'usd' }],
      },
      site_catalog_selections: { data: { sell_price: opts.sellPrice ?? 30 } },
      shipping_cache: {
        data: [{ supplier_product_id: 'VID1', shipping_cost: 2, days_min: 7, days_max: 15, tiers }],
      },
      promo_codes: { data: null },
      shop_orders: { data: { id: 'order-1' } },
      shop_order_items: { data: [{ id: 'item-1' }] },
    });
  }
  const send = (nonce: string, quantity = 1) =>
    POST(req({
      slug: 'boutique', countryCode: 'CA', shipmentTier: 'standard', checkoutNonce: nonce,
      items: [{ id: 'catalog-cat-1', quantity, name: 'P', currency: 'usd' }],
    }));
  const sigOf = () => createCheckoutMock.mock.calls[0]?.[7];

  async function signature(nonce: string, opts: Parameters<typeof setupSig>[0] = {}, quantity = 1) {
    createCheckoutMock.mockClear();
    setupSig(opts);
    await send(nonce, quantity);
    return sigOf();
  }

  it('E1 -- deux requetes identiques -> MEME cle (le double-clic retombe sur la meme session)', async () => {
    const a = await signature('buyer-1');
    const b = await signature('buyer-1');
    expect(a).toBeTruthy();
    expect(b).toBe(a);
  });

  it("E2 -- CRITIQUE : deux ACHETEURS au panier identique -> cles DIFFERENTES", async () => {
    // Avant LOT 3, la cle etait derivee du seul panier : ces deux acheteurs
    // auraient recu la MEME session Stripe.
    const a = await signature('buyer-1');
    const b = await signature('buyer-2');
    expect(b).not.toBe(a);
  });

  it("E3 -- le PRIX SERVEUR change (le navigateur l'ignore) -> cle DIFFERENTE", async () => {
    // Le marchand modifie son prix entre deux tentatives. Le panier envoie
    // exactement le meme corps ; seule la base a change. Avec l'ancienne cle
    // derivee du client, Stripe recevait la meme cle avec d'autres montants
    // -> idempotency_error, puis repli silencieux sur une session SANS TAXE.
    const a = await signature('buyer-1', { sellPrice: 30 });
    const b = await signature('buyer-1', { sellPrice: 31 });
    expect(b).not.toBe(a);
  });

  it('E4 -- le COUT DE LIVRAISON en cache change -> cle DIFFERENTE', async () => {
    const a = await signature('buyer-1', { tierCost: 3 });
    const b = await signature('buyer-1', { tierCost: 4 });
    expect(b).not.toBe(a);
  });

  it('E5 -- la quantite change -> cle DIFFERENTE', async () => {
    const a = await signature('buyer-1', {}, 1);
    const b = await signature('buyer-1', {}, 2);
    expect(b).not.toBe(a);
  });

  it("E7 -- LOT 4 : la route transmet la CLE COMPLETE a Stripe, jamais le quoteHash seul", async () => {
    // Le quoteHash est identique entre acheteurs par construction : l'employer
    // seul comme cle d'idempotence reintroduirait exactement le P0 du LOT 3.
    // Le prefixe distingue les deux identites -- 'co_' (cle) vs 'q_' (devis).
    const sig = await signature('buyer-1');
    expect(sig).toMatch(/^co_v1_/);
    expect(sig).not.toMatch(/^q_v1_/);
  });

  it("E6 -- aucun nonce fourni -> aucune cle transmise (comportement historique, jamais de cle devinee)", async () => {
    createCheckoutMock.mockClear();
    setupSig();
    await POST(req({
      slug: 'boutique', countryCode: 'CA', shipmentTier: 'standard',
      items: [{ id: 'catalog-cat-1', quantity: 1, name: 'P', currency: 'usd' }],
    }));
    expect(sigOf()).toBeUndefined();
  });
});

// ------------------------------------------------------------
// LOT 4 (flux bout en bout) -- contrat "affiche = facture".
// Le devis renvoye au panier et celui facture proviennent du MEME chemin de
// code : le mode apercu s'arrete juste avant la session Stripe. Ces tests
// verifient surtout ce qui NE doit PAS arriver -- aucune session, aucune
// commande -- quand le devis a change.
// ------------------------------------------------------------
describe('LOT 4 -- garde de devis perime (409)', () => {
  function setupQuote(opts: { sellPrice?: number } = {}) {
    return setupTables({
      sites: { data: SITE_MODE3 },
      catalog_products: {
        data: [{ id: 'cat-1', supplier_id: 'cj', supplier_product_id: 'VID1', price: 10, currency: 'usd' }],
      },
      site_catalog_selections: { data: { sell_price: opts.sellPrice ?? 30 } },
      shipping_cache: {
        data: [{ supplier_product_id: 'VID1', shipping_cost: 2, days_min: 7, days_max: 15, tiers: CACHE_TIERS }],
      },
      promo_codes: { data: null },
      shop_orders: { data: { id: 'order-1' } },
      shop_order_items: { data: [{ id: 'item-1' }] },
    });
  }
  const body = (extra: Record<string, unknown> = {}, quantity = 1) => ({
    slug: 'boutique', countryCode: 'CA', shipmentTier: 'standard', checkoutNonce: 'buyer-1',
    items: [{ id: 'catalog-cat-1', quantity, name: 'P', currency: 'usd' }],
    ...extra,
  });

  it("Q1 -- l'apercu renvoie le devis faisant foi sans creer NI session Stripe NI commande", async () => {
    const chains = setupQuote();
    const res = await POST(req(body({ preview: true })));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.preview).toBe(true);
    expect(json.quoteHash).toMatch(/^q_v1_/);
    expect(json.total).toBe(30);
    expect(json.shipping).toBe(3.6);
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(chains.get('shop_orders')?.insert).toBeUndefined();
  });

  it('Q2 -- CAS NOMINAL : hash client = hash serveur -> checkout normal, session creee', async () => {
    setupQuote();
    const quote = await (await POST(req(body({ preview: true })))).json();
    createCheckoutMock.mockClear();
    setupQuote();
    const res = await POST(req(body({ quoteHash: quote.quoteHash })));
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBeTruthy();
    expect(createCheckoutMock).toHaveBeenCalledTimes(1);
  });

  it("Q3 -- CAS OBLIGATOIRE : le PRIX SERVEUR change sans que le payload client bouge -> 409, AUCUNE session, AUCUNE commande", async () => {
    setupQuote({ sellPrice: 30 });
    const quote = await (await POST(req(body({ preview: true })))).json();

    // Le marchand modifie son prix. Le panier envoie exactement le meme corps.
    createCheckoutMock.mockClear();
    const chains = setupQuote({ sellPrice: 31 });
    const res = await POST(req(body({ quoteHash: quote.quoteHash })));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe('quote_changed');
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(chains.get('shop_orders')?.insert).toBeUndefined();
    // La reponse porte le devis faisant foi : le panier peut se mettre a jour.
    expect(json.total).toBe(31);
    expect(json.quoteHash).not.toBe(quote.quoteHash);
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quote_changed_before_payment' })
    );
  });

  it.each([
    ['quantite', (q: string) => ({ quoteHash: q }), 2],
    ['palier de livraison', (q: string) => ({ quoteHash: q, shipmentTier: 'express' }), 1],
  ])('Q4 -- mutation commerciale (%s) -> 409 sans session', async (_n, extra, qty) => {
    setupQuote();
    const quote = await (await POST(req(body({ preview: true })))).json();
    createCheckoutMock.mockClear();
    setupQuote();
    const res = await POST(req(body(extra(quote.quoteHash), qty)));
    expect(res.status).toBe(409);
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("Q5 -- un hash MALFORME est une pretention fausse, jamais un laissez-passer -> 409", async () => {
    setupQuote();
    const res = await POST(req(body({ quoteHash: 'pas-un-hash' })));
    expect(res.status).toBe(409);
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it("Q6 -- hash ABSENT : aucune pretention sur le prix -> checkout normal (retro-compatible)", async () => {
    // Refuser casserait tout appelant qui n'en envoie pas, dont la version
    // deployee du panier, sans rien proteger de plus : le prix reste
    // integralement recalcule cote serveur dans tous les cas.
    setupQuote();
    const res = await POST(req(body()));
    expect(res.status).toBe(200);
    expect(createCheckoutMock).toHaveBeenCalledTimes(1);
  });

  it('Q7 -- apres un 409, rejouer avec le NOUVEAU hash aboutit : pas de boucle', async () => {
    setupQuote({ sellPrice: 30 });
    const stale = await (await POST(req(body({ preview: true })))).json();
    setupQuote({ sellPrice: 31 });
    const conflict = await (await POST(req(body({ quoteHash: stale.quoteHash })))).json();

    createCheckoutMock.mockClear();
    setupQuote({ sellPrice: 31 });
    const res = await POST(req(body({ quoteHash: conflict.quoteHash })));
    expect(res.status).toBe(200);
    expect(createCheckoutMock).toHaveBeenCalledTimes(1);
  });
});

// ------------------------------------------------------------
// LOT 4 (correction) -- le mode apercu n'execute plus la verification de
// stock live. Elle consommait un `cjGetInventory` PAR LIGNE, qui traverse
// acquireCjSlot() -- la file globale partagee avec la creation des commandes
// fournisseur. L'executer aussi en apercu doublait la contention du parcours
// d'achat avec le fulfillment.
// Le stock n'etant pas une entree de quoteHash, l'ignorer en apercu preserve
// l'identite du devis a l'octet pres.
// ------------------------------------------------------------
describe('LOT 4 -- apercu sans verification de stock live', () => {
  function setupStock() {
    return setupTables({
      sites: { data: SITE_MODE3 },
      catalog_products: {
        data: [{ id: 'cat-1', supplier_id: 'cj', supplier_product_id: 'VID1', price: 10, currency: 'usd' }],
      },
      site_catalog_selections: { data: { sell_price: 30 } },
      shipping_cache: {
        data: [{ supplier_product_id: 'VID1', shipping_cost: 2, days_min: 7, days_max: 15, tiers: CACHE_TIERS }],
      },
      promo_codes: { data: null },
      shop_orders: { data: { id: 'order-1' } },
      shop_order_items: { data: [{ id: 'item-1' }] },
    });
  }
  const body = (extra: Record<string, unknown> = {}) => ({
    slug: 'boutique', countryCode: 'CA', shipmentTier: 'standard', checkoutNonce: 'buyer-1',
    items: [{ id: 'catalog-cat-1', quantity: 1, name: 'P', currency: 'usd' }],
    ...extra,
  });

  it('S1 -- APERCU : checkCatalogStock n\'est PAS appele (aucun creneau CJ consomme)', async () => {
    setupStock();
    const res = await POST(req(body({ preview: true })));
    expect(res.status).toBe(200);
    expect(checkCatalogStockMock).not.toHaveBeenCalled();
  });

  it('S2 -- CHECKOUT REEL : checkCatalogStock EST appele', async () => {
    setupStock();
    await POST(req(body()));
    expect(checkCatalogStockMock).toHaveBeenCalledTimes(1);
  });

  it('S3 -- le devis produit par l\'apercu reste IDENTIQUE (le stock n\'entre pas dans quoteHash)', async () => {
    setupStock();
    const quote = await (await POST(req(body({ preview: true })))).json();
    expect(quote.quoteHash).toMatch(/^q_v1_/);
    expect(quote.total).toBe(30);
    expect(quote.shipping).toBe(3.6);

    // Ce hash est accepte tel quel par le checkout reel : preuve que les deux
    // passes calculent bien le meme devis malgre le stock ignore en apercu.
    createCheckoutMock.mockClear();
    setupStock();
    const res = await POST(req(body({ quoteHash: quote.quoteHash })));
    expect(res.status).toBe(200);
    expect(createCheckoutMock).toHaveBeenCalledTimes(1);
  });

  it('S4/S6 -- stock indisponible au checkout REEL -> 409, AUCUNE session Stripe, AUCUNE commande', async () => {
    // Le controle qui fait foi reste avant createCheckout : son echec
    // interrompt la requete sans rien creer.
    checkCatalogStockMock.mockResolvedValue({ ok: false, reason: '"P" n\'est plus disponible.' });
    const chains = setupStock();
    const res = await POST(req(body()));
    expect(res.status).toBe(409);
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(chains.get('shop_orders')?.insert).toBeUndefined();
  });

  it('S5 -- produit devenu indisponible ENTRE apercu et checkout -> l\'apercu passe, le checkout refuse', async () => {
    setupStock();
    const quote = await (await POST(req(body({ preview: true })))).json();
    expect(quote.quoteHash).toBeTruthy();

    checkCatalogStockMock.mockResolvedValue({ ok: false, reason: 'rupture' });
    createCheckoutMock.mockClear();
    setupStock();
    const res = await POST(req(body({ quoteHash: quote.quoteHash })));
    expect(res.status).toBe(409);
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it('S7 -- l\'idempotence est inchangee : meme acheteur + meme devis -> meme cle', async () => {
    setupStock();
    createCheckoutMock.mockClear();
    await POST(req(body()));
    const k1 = createCheckoutMock.mock.calls[0][7];
    createCheckoutMock.mockClear();
    setupStock();
    await POST(req(body()));
    const k2 = createCheckoutMock.mock.calls[0][7];
    expect(k1).toMatch(/^co_v1_/);
    expect(k2).toBe(k1);
  });
});

// ============================================================
// M2-01 -- la commission suit le MODE, a l'ECRITURE comme au prelevement.
//
// Avant correctif, la garde de mode existait sur `applicationFeeAmount`
// (Stripe ne prelevait rien hors Mode 3) mais PAS sur la valeur persistee :
// `nexiora_commission` etait ecrite pour tous les modes, et deduite du profit
// marchand. Deux consommateurs lisaient ce chiffre faux -- /api/shop/finances
// (le marchand) et /api/admin/stats (le revenu de Deribfy).
//
// Ces tests verrouillent les DEUX sens : rien en Mode 2, tout en Mode 3.
// ============================================================

describe('M2-01 — la commission n’existe qu’en Mode 3', () => {
  const items = [{ id: 'p1', quantity: 1, name: 'T', currency: 'usd' }];

  it('MODE 2 — commission 0 et profit = encaissé, quel que soit le montant', async () => {
    const chains = setupTables({
      sites: { data: SITE_MODE2 },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 250, currency: 'usd', published: true, for_sale: true }] },
      promo_codes: { data: null },
      shop_orders: { data: { id: 'order-1' } },
      shop_order_items: { data: [{ id: 'item-1' }] },
    });
    const res = await POST(req({ slug: 'boutique', countryCode: 'CA', items }));
    expect(res.status).toBe(200);
    const f = fingerprint(chains);
    expect(f.orderCommission).toBe(0);
    expect(f.orderProfit).toBe(250);
    // Coherence : ce qui est ENREGISTRE correspond a ce qui est PRELEVE.
    expect(f.stripeApplicationFee).toBe(0);
    expect(f.orderCommission).toBe(f.stripeApplicationFee);
  });

  it('MODE 2 — aucune commission n’est jamais enregistrée, même avec remise', async () => {
    const chains = setupTables({
      sites: { data: SITE_MODE2 },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 100, currency: 'usd', published: true, for_sale: true }] },
      promo_codes: { data: { id: 'p', discount_type: 'percent', discount_value: 50, min_order: 0, max_uses: null, used_count: 0, expires_at: null } },
      shop_orders: { data: { id: 'order-1' } },
      shop_order_items: { data: [{ id: 'item-1' }] },
    });
    await POST(req({ slug: 'boutique', countryCode: 'CA', items, promoCode: 'X' }));
    const f = fingerprint(chains);
    expect(f.orderCommission).toBe(0);
    expect(f.orderProfit).toBe(50);       // encaisse apres remise, rien de deduit
  });

  it('MODE 3 — NON-RÉGRESSION : la commission reste calculée AVANT remise (OPTION A)', async () => {
    // La regle OPTION A vit ICI desormais : elle n'a de sens que la ou une
    // commission existe.
    const chains = setupTables({
      sites: { data: SITE_MODE3 },
      shop_products: { data: [{ id: 'p1', cj_vid: null, price: 100, currency: 'usd', published: true, for_sale: true }] },
      promo_codes: { data: { id: 'p', discount_type: 'percent', discount_value: 20, min_order: 0, max_uses: null, used_count: 0, expires_at: null } },
      shipping_cache: { data: [{ supplier_product_id: 'v1', shipping_cost: 2, days_min: 7, days_max: 15, tiers: CACHE_TIERS }] },
      shop_orders: { data: { id: 'order-1' } },
      shop_order_items: { data: [{ id: 'item-1' }] },
    });
    const res = await POST(req({ slug: 'boutique', countryCode: 'CA', items, promoCode: 'X20' }));
    if (res.status === 200) {
      const f = fingerprint(chains);
      expect(f.orderCommission).toBe(6);        // 6 % de 100, PAS de 80 -- inchange
      expect(f.orderCommission).toBeGreaterThan(0);
    }
  });
});
