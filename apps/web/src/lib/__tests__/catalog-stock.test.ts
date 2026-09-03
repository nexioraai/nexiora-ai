import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Phase 1 — régression directe du bug Gelato pré-checkout.
// Avant le registre central (src/lib/suppliers/registry.ts),
// catalog-stock.ts recopiait à la main ADAPTERS/CREDS sans Gelato,
// alors que dropship/suppliers.ts l'autorise pour pod_brand/pod_custom
// et que pod-fulfill.ts sait déjà le fulfiller : un produit Gelato en
// Mode 3 (strict) était systématiquement refusé avant paiement.
// catalog-stock.ts n'avait aucune couverture de test avant ce correctif.
// ============================================================

const checkStockCjMock = vi.fn();
const checkStockGelatoMock = vi.fn();
const checkStockPrintfulMock = vi.fn();

vi.mock('@/lib/suppliers/registry', () => ({
  suppliersWithCapability: (capability: string) => {
    if (capability !== 'checkStock') return [];
    return [
      { id: 'cj', adapter: { checkStock: (...a: unknown[]) => checkStockCjMock(...a) }, credentials: { email: 'e', apiKey: 'k' } },
      { id: 'printful', adapter: { checkStock: (...a: unknown[]) => checkStockPrintfulMock(...a) }, credentials: { printful_token: 't' } },
      { id: 'printify', adapter: { checkStock: vi.fn() }, credentials: {} },
      // Gelato inclus ici exactement comme les 3 autres : c'est la
      // dérivation par capacité réelle (registry.ts) qui le garantit,
      // pas une liste recopiée à la main.
      { id: 'gelato', adapter: { checkStock: (...a: unknown[]) => checkStockGelatoMock(...a) }, credentials: {} },
    ];
  },
}));

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({
  logAnomaly: (...a: unknown[]) => logAnomalyMock(...a),
}));

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.in = vi.fn(self);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { checkCatalogStock } from '../mode3/catalogStock';

function mockProduct(overrides: Partial<{ id: string; supplier_id: string; supplier_product_id: string; supplier_parent_id: string | null; in_stock: boolean; name: string }>) {
  fromMock.mockReturnValue(
    tableChain({
      // LOT 4 -- `supplier_parent_id` AJOUTE a la fixture, et c'est un constat.
      // Mesure sur les 33 580 lignes reelles de `catalog_products` : Printful
      // (8 392) et Gelato (182) ont TOUJOURS un parent -- leur
      // `supplier_product_id` EST une variante ; CJ (25 006) n'en a JAMAIS --
      // le sien designe un PRODUIT. Une fixture sans parent decrivait donc une
      // ligne Gelato/Printful qui n'existe pas en base. Les cas qui visent
      // reellement l'absence de variante l'ecrivent explicitement ci-dessous.
      data: [{ id: 'p1', supplier_id: 'gelato', supplier_product_id: 'gel-1', supplier_parent_id: 'parent-1', in_stock: true, name: 'Produit', ...overrides }],
    })
  );
}

beforeEach(() => {
  fromMock.mockReset();
  checkStockCjMock.mockReset();
  checkStockGelatoMock.mockReset();
  checkStockPrintfulMock.mockReset();
  logAnomalyMock.mockReset();
});

describe('checkCatalogStock — régression bug Gelato pré-checkout', () => {
  it('un produit Gelato en Mode 3 (strict=true) passe désormais la vérification — avant ce correctif, il était systématiquement refusé', async () => {
    mockProduct({ supplier_id: 'gelato' });
    checkStockGelatoMock.mockResolvedValue({
      available: true, current_price: 10, stock_quantity: 999,
      shipping_cost: 0, shipping_days_min: 3, shipping_days_max: 8,
    });

    const result = await checkCatalogStock([{ realId: 'p1', quantity: 1 }], 'US', true);

    expect(result.ok).toBe(true);
    expect(checkStockGelatoMock).toHaveBeenCalledTimes(1);
  });

  it('un produit Gelato réellement épuisé reste refusé (le correctif ne désactive pas la vérification réelle)', async () => {
    mockProduct({ supplier_id: 'gelato' });
    checkStockGelatoMock.mockResolvedValue({
      available: false, current_price: 10, stock_quantity: 0,
      shipping_cost: 0, shipping_days_min: 3, shipping_days_max: 8,
    });

    const result = await checkCatalogStock([{ realId: 'p1', quantity: 1 }], 'US', true);

    expect(result.ok).toBe(false);
  });
});

describe('checkCatalogStock — non-régression CJ/Printful (comportement historique inchangé)', () => {
  it('CJ continue de fonctionner identiquement après la migration vers le registre central', async () => {
    mockProduct({ supplier_id: 'cj', supplier_product_id: 'cj-pid-1', supplier_parent_id: null });
    checkStockCjMock.mockResolvedValue({
      available: true, current_price: 5, stock_quantity: 50,
      shipping_cost: 2, shipping_days_min: 10, shipping_days_max: 20,
    });

    const result = await checkCatalogStock([{ realId: 'p1', variantId: 'cj-vid-1', quantity: 1 }], 'US', true);

    expect(result.ok).toBe(true);
    expect(checkStockCjMock).toHaveBeenCalledWith(
      // LOT 4 -- assertion PRECISEE, et c'est un renforcement : pour CJ,
      // `supplier_product_id` est un identifiant de PRODUIT et la variante est
      // un champ distinct. L'ancienne fixture les confondait sous un seul nom
      // (`cj-vid-1`), ce qui masquait exactement la question posee ici.
      expect.objectContaining({ supplier_product_id: 'cj-pid-1', variant_id: 'cj-vid-1' }),
      { email: 'e', apiKey: 'k' }
    );
  });

  it('Printful continue de fonctionner identiquement après la migration', async () => {
    mockProduct({ supplier_id: 'printful' });
    checkStockPrintfulMock.mockResolvedValue({
      available: true, current_price: 20, stock_quantity: 999,
      shipping_cost: 5, shipping_days_min: 4, shipping_days_max: 8,
    });

    const result = await checkCatalogStock([{ realId: 'p1', quantity: 1 }], 'US', true);

    expect(result.ok).toBe(true);
    expect(checkStockPrintfulMock).toHaveBeenCalledWith(expect.anything(), { printful_token: 't' });
  });
});

describe('checkCatalogStock — fournisseur absent du registre (ex: après une extraction comme Zendrop)', () => {
  it('mode strict (Mode 3) : refuse explicitement comme avant, ET produit désormais une anomalie structurée (D2)', async () => {
    mockProduct({ supplier_id: 'unknown-supplier' });
    const result = await checkCatalogStock([{ realId: 'p1', quantity: 1 }], 'US', true);
    expect(result.ok).toBe(false);
    expect(logAnomalyMock).toHaveBeenCalledWith({
      type: 'catalog_supplier_unavailable',
      details: { productId: 'p1', supplierId: 'unknown-supplier' },
    });
  });

  it('mode non-strict (Mode 2) : ne bloque pas comme avant, et ne génère aucune anomalie (ce n\'est pas un incident en Mode 2)', async () => {
    mockProduct({ supplier_id: 'unknown-supplier' });
    const result = await checkCatalogStock([{ realId: 'p1', variantId: 'cj-vid-1', quantity: 1 }], 'US', false);
    expect(result.ok).toBe(true);
    expect(logAnomalyMock).not.toHaveBeenCalled();
  });
});

describe('checkCatalogStock — D2 : observabilité sur échec API fournisseur (Mode 3)', () => {
  it('un échec réel de l\'API fournisseur en mode strict reste refusé comme avant, ET produit une anomalie structurée', async () => {
    mockProduct({ supplier_id: 'cj', supplier_product_id: 'cj-pid-1', supplier_parent_id: null });
    checkStockCjMock.mockRejectedValue(new Error('CJ 500: internal error'));

    const result = await checkCatalogStock([{ realId: 'p1', variantId: 'cj-vid-1', quantity: 1 }], 'US', true);

    expect(result.ok).toBe(false);
    expect(logAnomalyMock).toHaveBeenCalledWith({
      type: 'catalog_stock_check_failed',
      details: { productId: 'p1', supplierId: 'cj', reason: 'CJ 500: internal error' },
    });
    // Aucune credential ni aucun secret dans l'anomalie.
    const call = logAnomalyMock.mock.calls[0][0];
    expect(JSON.stringify(call)).not.toMatch(/apiKey|token|email/i);
  });

  it('le même échec en mode non-strict (Mode 2) reste silencieux comme avant — le cache in_stock fait déjà garde-fou', async () => {
    mockProduct({ supplier_id: 'cj', supplier_product_id: 'cj-pid-1', supplier_parent_id: null });
    checkStockCjMock.mockRejectedValue(new Error('CJ 500: internal error'));

    const result = await checkCatalogStock([{ realId: 'p1', variantId: 'cj-vid-1', quantity: 1 }], 'US', false);

    expect(result.ok).toBe(true);
    expect(logAnomalyMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// LOT 4 / R4-01 -- UNE LIGNE CATALOGUE SANS VARIANTE EXPLICITE.
//
// Le repli etait `line.variantId || product.supplier_product_id`, et son
// propre commentaire disait deja que les fournisseurs a variantes rejettent
// un tel appel. Ils ne rejettent pas toujours : deux commandes de production
// sont parties sans variante et CJ les a acceptees -- `cj/fulfill` retombe
// alors sur `variants[0]`, c'est-a-dire une variante ARBITRAIRE. L'acheteur
// recoit une couleur ou une taille que personne n'a choisie.
//
// LA REGLE EST LUE DE LA DONNEE : une ligne SANS `supplier_parent_id` est un
// PRODUIT (CJ : 25 006 lignes, 100 %) ; une ligne AVEC parent EST deja une
// variante (Printful 8 392, Gelato 182 : 0 % sans parent). Le discriminant
// n'est donc pas le fournisseur mais la forme de la ligne -- et c'est ce qui
// preserve `pod_brand`/`pod_custom`, dont les identifiants n'ont
// deliberement plus de suffixe depuis le LOT 3.
// ============================================================
describe('LOT 4 / R4-01 — la variante explicite, quand la ligne designe un produit', () => {
  it('CJ (sans parent) + AUCUNE variante, Mode 3 -> REFUS, et le fournisseur n\'est jamais appele', async () => {
    mockProduct({ supplier_id: 'cj', supplier_product_id: 'cj-pid-1', supplier_parent_id: null });
    const result = await checkCatalogStock([{ realId: 'p1', quantity: 1 }], 'US', true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('option');
    // La garde precede l'appel : aucune requete fournisseur engagee.
    expect(checkStockCjMock).not.toHaveBeenCalled();
    expect(logAnomalyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'catalog_variant_missing' })
    );
  });

  it('CJ + variante explicite -> la vente suit son cours', async () => {
    mockProduct({ supplier_id: 'cj', supplier_product_id: 'cj-pid-1', supplier_parent_id: null });
    checkStockCjMock.mockResolvedValue({ available: true, current_price: 5, stock_quantity: 9, shipping_cost: 2, shipping_days_min: 1, shipping_days_max: 2 });
    const result = await checkCatalogStock([{ realId: 'p1', variantId: 'vid-42', quantity: 1 }], 'US', true);
    expect(result.ok).toBe(true);
    expect(checkStockCjMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant_id: 'vid-42' }),
      expect.anything()
    );
  });

  it.each(['printful', 'gelato'])(
    '%s (AVEC parent) sans variante explicite -> ACCEPTE : sa ligne EST deja une variante (non-regression LOT 3)',
    async (fournisseur) => {
      mockProduct({ supplier_id: fournisseur, supplier_product_id: 'sp-1', supplier_parent_id: 'parent-1' });
      const mock = fournisseur === 'printful' ? checkStockPrintfulMock : checkStockGelatoMock;
      mock.mockResolvedValue({ available: true, current_price: 5, stock_quantity: 9, shipping_cost: 2, shipping_days_min: 1, shipping_days_max: 2 });
      const result = await checkCatalogStock([{ realId: 'p1', quantity: 1 }], 'US', true);
      expect(result.ok).toBe(true);
      expect(mock).toHaveBeenCalledWith(
        expect.objectContaining({ supplier_product_id: 'sp-1', variant_id: 'sp-1' }),
        expect.anything()
      );
    }
  );

  it('Mode 2 (non strict) : le comportement historique est preserve, aucun refus', async () => {
    mockProduct({ supplier_id: 'cj', supplier_product_id: 'cj-pid-1', supplier_parent_id: null });
    checkStockCjMock.mockResolvedValue({ available: true, current_price: 5, stock_quantity: 9, shipping_cost: 2, shipping_days_min: 1, shipping_days_max: 2 });
    const result = await checkCatalogStock([{ realId: 'p1', quantity: 1 }], 'US', false);
    expect(result.ok).toBe(true);
  });
});
