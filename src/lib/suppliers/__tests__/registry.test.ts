import { describe, it, expect } from 'vitest';
import { getSupplier, allSuppliers, suppliersWithCapability } from '../registry';
import { suppliersForDropshipType } from '@/lib/dropship/suppliers';

// ============================================================
// Phase 1 — registre fournisseurs central (correction de la root cause
// du bug Gelato : avant ce fichier, 5 endroits reconstruisaient
// indépendamment CREDS+ADAPTERS, et Gelato — pourtant autorisé et
// pourvu d'un fulfillment réel — était absent de 4 d'entre eux).
// ============================================================

describe('registry — source centrale', () => {
  it('allSuppliers() retourne les 4 fournisseurs actifs, sans doublon', () => {
    const ids = allSuppliers().map((s) => s.id).sort();
    expect(ids).toEqual(['cj', 'gelato', 'printful', 'printify']);
  });

  it('getSupplier résout chaque fournisseur avec son adapter et ses credentials', () => {
    for (const id of ['cj', 'printful', 'printify', 'gelato']) {
      const s = getSupplier(id);
      expect(s).toBeDefined();
      expect(s!.id).toBe(id);
      expect(typeof s!.adapter.checkStock).toBe('function');
      expect(typeof s!.credentials).toBe('object');
    }
  });

  it('getSupplier retourne undefined pour un id inconnu — jamais une valeur inventée', () => {
    expect(getSupplier('zendrop')).toBeUndefined();
    expect(getSupplier('does-not-exist')).toBeUndefined();
  });
});

describe('registry — dérivation de capacité (cause structurelle du fix Gelato)', () => {
  it('checkStock : les 4 fournisseurs actuels le supportent réellement, Gelato inclus — corrige le bug pré-checkout', () => {
    const ids = suppliersWithCapability('checkStock').map((s) => s.id).sort();
    expect(ids).toEqual(['cj', 'gelato', 'printful', 'printify']);
  });

  it('createOrder / getTracking / syncCatalog : obligatoires, les 4 fournisseurs les supportent', () => {
    for (const cap of ['createOrder', 'getTracking', 'syncCatalog'] as const) {
      const ids = suppliersWithCapability(cap).map((s) => s.id).sort();
      expect(ids).toEqual(['cj', 'gelato', 'printful', 'printify']);
    }
  });

  it('calculateShipping : les 4 fournisseurs le supportent réellement, Gelato inclus', () => {
    const ids = suppliersWithCapability('calculateShipping').map((s) => s.id).sort();
    expect(ids).toEqual(['cj', 'gelato', 'printful', 'printify']);
  });

  it('listVariants : Gelato en est légitimement absent (chaque CatalogProduct Gelato est déjà la variante exacte) — ne doit JAMAIS être "corrigé" par erreur', () => {
    const ids = suppliersWithCapability('listVariants').map((s) => s.id).sort();
    expect(ids).toEqual(['cj', 'printful', 'printify']);
    expect(ids).not.toContain('gelato');
  });
});

describe('registre métier (dropship/suppliers.ts) — cohérence croisée avec la source centrale', () => {
  it('tout supplier_id autorisé par sous-type Mode 3 existe réellement dans le registre central', () => {
    const referenced = new Set<string>([
      ...suppliersForDropshipType('reseller'),
      ...suppliersForDropshipType('pod_brand'),
      ...suppliersForDropshipType('pod_custom'),
    ]);
    for (const id of referenced) {
      expect(getSupplier(id), `"${id}" référencé par dropship/suppliers.ts mais absent du registre central`).toBeDefined();
    }
  });

  it('Gelato est autorisé pour pod_brand/pod_custom ET présent dans le registre central capable de checkStock — la chaîne complète qui a cassé le checkout est maintenant cohérente de bout en bout', () => {
    expect(suppliersForDropshipType('pod_brand')).toContain('gelato');
    expect(suppliersForDropshipType('pod_custom')).toContain('gelato');
    const checkStockIds = suppliersWithCapability('checkStock').map((s) => s.id);
    expect(checkStockIds).toContain('gelato');
  });
});
