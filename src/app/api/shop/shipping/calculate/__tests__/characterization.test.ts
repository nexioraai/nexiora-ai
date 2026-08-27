import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// LOT 0 -- CARACTERISATION de la route d'AFFICHAGE du panier.
//
// Cette route n'avait AUCUN test. Elle est pourtant la moitie du contrat
// "affiche = facture" : le panier montre ce qu'elle renvoie, le checkout
// facture ce qu'il recalcule de son cote. Ces tests figent ce qu'elle
// produit AUJOURD'HUI, y compris la ou elle diverge du checkout.
//
// Aucun appel CJ reel : l'adaptateur fournisseur est un mock local.
// ============================================================

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

const calculateShippingMock = vi.fn();
vi.mock('@/lib/suppliers/registry', () => ({
  suppliersWithCapability: () => [
    {
      id: 'cj',
      credentials: {},
      adapter: { calculateShipping: (...a: unknown[]) => calculateShippingMock(...a) },
    },
  ],
}));

import { POST } from '../route';

type Handlers = Record<string, { data: unknown; error?: unknown }>;

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.in = vi.fn(self);
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

const CACHE_TIERS = [
  { tier: 'eco', name: 'CJPacket Ordinary', cost: 2, days_min: 7, days_max: 15 },
  { tier: 'standard', name: 'CJPacket Sensitive', cost: 3, days_min: 4, days_max: 7 },
  { tier: 'express', name: 'DHL Official', cost: 4, days_min: 3, days_max: 5 },
];

function setup(opts: { tiers?: unknown; catalog?: boolean } = {}) {
  return setupTables({
    sites: { data: { id: 'site-1', mode: 2, shipping_flat: 5 } },
    catalog_products: {
      data: opts.catalog === false
        ? []
        : [{ id: 'cat-1', supplier_id: 'cj', supplier_product_id: 'VID1' }],
    },
    shop_products: { data: [] },
    shipping_cache: {
      data: [{ supplier_product_id: 'VID1', shipping_cost: 2, days_min: 7, days_max: 15, tiers: opts.tiers === undefined ? CACHE_TIERS : opts.tiers }],
    },
  });
}

function req(body: unknown) {
  return new Request('https://woorri.test/api/shop/shipping/calculate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const cart = (quantity = 1) =>
  req({ slug: 'boutique', countryCode: 'CA', items: [{ id: 'catalog-cat-1', quantity }] });

beforeEach(() => {
  fromMock.mockReset();
  calculateShippingMock.mockReset().mockResolvedValue({
    total_cost: 2, estimated_days_min: 7, estimated_days_max: 15,
  });
});

describe('CARACTERISATION -- route d\'affichage du panier', () => {
  it("C1 -- paliers en cache : cout brut 3 -> affiche 3.60 (marge x1.20), libelles francais generes ici", async () => {
    setup();
    const json = await (await POST(cart())).json();
    expect(json.cjTiers).toEqual([
      { tier: 'eco', label: 'Économique', cost: 2.4, days_min: 7, days_max: 15 },
      { tier: 'standard', label: 'Standard', cost: 3.6, days_min: 4, days_max: 7 },
      { tier: 'express', label: 'Express', cost: 4.8, days_min: 3, days_max: 5 },
    ]);
    // Le nom reel du transporteur CJ (logisticName) n'est PAS expose au panier.
    expect(JSON.stringify(json.cjTiers)).not.toContain('CJPacket');
  });

  it("C2 -- CORRIGE : `shipping` et le palier affiche proviennent de la MEME source", async () => {
    setup();
    const json = await (await POST(cart())).json();
    // Avant LOT 2 : shipping=2 (live, sans marge) coexistait avec
    // cjTiers.standard=3.60 (cache, avec marge) dans la MEME reponse.
    expect(json.shipping).toBe(3.6);
    expect(json.cjTiers[1].cost).toBe(3.6);
    expect(json.source).toBe('cache');
  });

  it("C3 -- CORRIGE : cache sans paliers -> le panier affiche 2.40, exactement ce que le checkout facture", async () => {
    // Avant LOT 2 : cjTiers null -> le panier retombait sur `shipping` (live,
    // SANS marge) = 2.00, pendant que le checkout lisait shipping_cost du
    // cache et appliquait x1.20 = 2.40. Vingt pour cent d'ecart entre le
    // montant montre et le montant debite. Les deux lisent desormais la meme
    // source, dans le meme ordre.
    setup({ tiers: null });
    const json = await (await POST(cart())).json();
    expect(json.cjTiers).toBeNull();
    expect(json.shipping).toBe(2.4);
    expect(json.source).toBe('cache');
  });

  it("C4 -- CORRIGE : adaptateur live en echec + cache complet -> le cache reste utilisable", async () => {
    // Avant LOT 2 : le retour anticipe `unavailable` precedait le calcul des
    // paliers ; un cache parfaitement valide devenait inutilisable pour
    // l'affichage des que le fournisseur live echouait, alors que le checkout
    // savait le facturer. Le cache est desormais consulte EN PREMIER : le
    // live n'est meme pas appele.
    calculateShippingMock.mockRejectedValue(new Error('CJ down'));
    setup();
    const json = await (await POST(cart())).json();
    expect(json.source).toBe('cache');
    expect(json.shipping).toBe(3.6);
    expect(json.cjTiers).toHaveLength(3);
    expect(calculateShippingMock).not.toHaveBeenCalled();
  });

  it('C5 -- DEFAUT FIGE : qty 2 -> paliers multiplies lineairement (3 x 2 x 1.20 = 7.20)', async () => {
    setup();
    const json = await (await POST(cart(2))).json();
    expect(json.cjTiers[1].cost).toBe(7.2);
  });

  it('C6 -- aucun produit fournisseur -> forfait du site', async () => {
    setup({ catalog: false });
    const json = await (await POST(req({ slug: 'boutique', countryCode: 'CA', items: [{ id: 'catalog-inconnu', quantity: 1 }] }))).json();
    expect(json.shipping).toBe(5);
    expect(json.source).toBe('flat');
    expect(json.cjTiers).toBeNull();
  });

  it("C7 -- aucune source exploitable (pas de cache, live en echec) -> `unavailable`", async () => {
    calculateShippingMock.mockRejectedValue(new Error('CJ down'));
    setupTables({
      sites: { data: { id: 'site-1', mode: 2, shipping_flat: 5 } },
      catalog_products: { data: [{ id: 'cat-1', supplier_id: 'cj', supplier_product_id: 'VID1' }] },
      shop_products: { data: [] },
      shipping_cache: { data: [] },
    });
    const json = await (await POST(cart())).json();
    expect(json).toEqual({ shipping: 0, source: 'unavailable' });
  });

});
