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
    sites: { data: { id: 'site-1', shipping_flat: 5 } },
    catalog_products: {
      data: opts.catalog === false
        ? []
        : [{ id: 'cat-1', supplier_id: 'cj', supplier_product_id: 'VID1' }],
    },
    shop_products: { data: [] },
    shipping_cache: {
      data: [{ supplier_product_id: 'VID1', tiers: opts.tiers === undefined ? CACHE_TIERS : opts.tiers }],
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

  it("C2 -- DIVERGENCE FIGEE : `shipping` (live, SANS marge) et `cjTiers` (cache, AVEC marge) coexistent dans la meme reponse", async () => {
    setup();
    const json = await (await POST(cart())).json();
    expect(json.shipping).toBe(2);                        // live, marge absente
    expect(json.cjTiers[1].cost).toBe(3.6);               // cache, marge presente
    expect(json.source).toBe('cj');
  });

  it("C3 -- DEFAUT FIGE : cache sans paliers -> le panier affiche 2.00 alors que le checkout facturera 2.40", async () => {
    // tiers null -> cjTiers non calcule -> CartDrawer retombe sur `shipping`
    // (live, sans marge). Le checkout, lui, lit shipping_cost du cache et
    // applique x1.20. Affiche != facture, de 20 %.
    setup({ tiers: null });
    const json = await (await POST(cart())).json();
    expect(json.cjTiers).toBeNull();
    expect(json.shipping).toBe(2);
  });

  it('C4 -- DEFAUT FIGE : aucun adaptateur ne repond -> `unavailable` AVANT tout calcul de paliers, meme avec un cache complet', async () => {
    // Retour anticipe (`sources.length === 0`) place AVANT le bloc cjTiers :
    // un cache parfaitement valide devient inutilisable pour l'affichage des
    // que le fournisseur live echoue -- alors que le checkout, lui, saurait
    // facturer depuis ce meme cache.
    calculateShippingMock.mockRejectedValue(new Error('CJ down'));
    setup();
    const json = await (await POST(cart())).json();
    expect(json).toEqual({ shipping: 0, source: 'unavailable' });
    expect(json.cjTiers).toBeUndefined();
  });

  it('C5 -- DEFAUT FIGE : qty 2 -> paliers multiplies lineairement (3 x 2 x 1.20 = 7.20)', async () => {
    setup();
    const json = await (await POST(cart(2))).json();
    expect(json.cjTiers[1].cost).toBe(7.2);
  });

  it('C6 -- aucun produit fournisseur -> forfait du site', async () => {
    setup({ catalog: false });
    const json = await (await POST(req({ slug: 'boutique', countryCode: 'CA', items: [{ id: 'catalog-inconnu', quantity: 1 }] }))).json();
    expect(json).toEqual({ shipping: 5, source: 'flat' });
  });
});
