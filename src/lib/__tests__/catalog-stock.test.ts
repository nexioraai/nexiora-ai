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

function mockProduct(overrides: Partial<{ id: string; supplier_id: string; supplier_product_id: string; in_stock: boolean; name: string }>) {
  fromMock.mockReturnValue(
    tableChain({
      data: [{ id: 'p1', supplier_id: 'gelato', supplier_product_id: 'gel-1', in_stock: true, name: 'Produit', ...overrides }],
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
    mockProduct({ supplier_id: 'cj', supplier_product_id: 'cj-vid-1' });
    checkStockCjMock.mockResolvedValue({
      available: true, current_price: 5, stock_quantity: 50,
      shipping_cost: 2, shipping_days_min: 10, shipping_days_max: 20,
    });

    const result = await checkCatalogStock([{ realId: 'p1', quantity: 1 }], 'US', true);

    expect(result.ok).toBe(true);
    expect(checkStockCjMock).toHaveBeenCalledWith(
      expect.objectContaining({ supplier_product_id: 'cj-vid-1' }),
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
    const result = await checkCatalogStock([{ realId: 'p1', quantity: 1 }], 'US', false);
    expect(result.ok).toBe(true);
    expect(logAnomalyMock).not.toHaveBeenCalled();
  });
});

describe('checkCatalogStock — D2 : observabilité sur échec API fournisseur (Mode 3)', () => {
  it('un échec réel de l\'API fournisseur en mode strict reste refusé comme avant, ET produit une anomalie structurée', async () => {
    mockProduct({ supplier_id: 'cj', supplier_product_id: 'cj-vid-1' });
    checkStockCjMock.mockRejectedValue(new Error('CJ 500: internal error'));

    const result = await checkCatalogStock([{ realId: 'p1', quantity: 1 }], 'US', true);

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
    mockProduct({ supplier_id: 'cj', supplier_product_id: 'cj-vid-1' });
    checkStockCjMock.mockRejectedValue(new Error('CJ 500: internal error'));

    const result = await checkCatalogStock([{ realId: 'p1', quantity: 1 }], 'US', false);

    expect(result.ok).toBe(true);
    expect(logAnomalyMock).not.toHaveBeenCalled();
  });
});
