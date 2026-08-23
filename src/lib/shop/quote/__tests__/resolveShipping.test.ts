import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// P0 MULTI-PRODUITS -- le palier est un LABEL, jamais une identite.
//
// L'agregation joignait les produits sur `eco`/`standard`/`express`. Deux
// produits peuvent porter le meme label pour des TRANSPORTEURS DIFFERENTS :
// le code additionnait DHL (produit A) et FedEx (produit B), etiquetait le
// resultat "Express" et ne memorisait que DHL. L'acheteur se voyait proposer
// une option qui n'existait chez AUCUN fournisseur.
//
// Ces tests attaquent resolveShipping() DIRECTEMENT : c'est la seule couche
// ou le defaut vit, et aucun test existant n'utilisait de panier
// multi-produits -- le defaut etait donc entierement decouvert.
// ============================================================

const { cacheRows } = vi.hoisted(() => ({ cacheRows: { value: [] as unknown[] } }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.in = () => Promise.resolve({ data: cacheRows.value });
      chain.then = (r: (v: unknown) => void) => r({ data: cacheRows.value });
      return chain;
    },
  },
}));

// Aucun adaptateur live : le cache est l'unique source, ce qui isole
// exactement le chemin corrige.
vi.mock('@/lib/suppliers/registry', () => ({ suppliersWithCapability: () => [] }));

import { resolveShipping } from '../resolveShipping';

type T = { tier: string; name: string; cost: number; days_min: number; days_max: number };
const tier = (t: string, name: string, cost: number, dmin = 5, dmax = 9): T =>
  ({ tier: t, name, cost, days_min: dmin, days_max: dmax });

function row(id: string, tiers: T[] | null, shippingCost = 2) {
  return { supplier_product_id: id, shipping_cost: shippingCost, days_min: 7, days_max: 15, tiers };
}
const groups = (ids: string[]) => ({ cj: ids.map((id) => ({ supplier_product_id: id, quantity: 1 })) });

const call = (rows: unknown[], ids: string[], requestedTier?: string) => {
  cacheRows.value = rows;
  return resolveShipping({ groups: groups(ids), countryCode: 'CA', flat: 0, requestedTier });
};

beforeEach(() => { cacheRows.value = []; });

describe('P0 -- multi-produits : un palier exige le MEME transporteur reel', () => {
  it('A -- meme logisticName chez les deux produits -> palier conserve, cout = somme', async () => {
    const q = await call(
      [
        row('A', [tier('eco', 'CJPacket', 3, 10, 20), tier('express', 'DHL', 9, 2, 4)]),
        row('B', [tier('eco', 'CJPacket', 4, 10, 20), tier('express', 'DHL', 10, 2, 4)]),
      ],
      ['A', 'B'],
      'express'
    );
    expect(q.tiers?.map((t) => t.tier)).toEqual(['eco', 'express']);
    // (9 + 10) x 1.20 = 22.80
    expect(q.amount).toBe(22.8);
    expect(q.logisticName).toBe('DHL');
  });

  it('B -- meme label mais logisticName DIFFERENTS -> palier supprime', async () => {
    // Avant le correctif : express = DHL + FedEx = 22.80, etiquete "DHL".
    // Cette option n'existait chez aucun fournisseur.
    const q = await call(
      [
        row('A', [tier('eco', 'CJPacket', 3, 10, 20), tier('express', 'DHL', 9, 2, 4)]),
        row('B', [tier('eco', 'CJPacket', 4, 10, 20), tier('express', 'FedEx', 10, 2, 4)]),
      ],
      ['A', 'B'],
      'express'
    );
    expect(q.tiers?.map((t) => t.tier)).toEqual(['eco']);
    expect(q.tiers?.some((t) => t.tier === 'express')).toBe(false);
    // Aucun transporteur synthetique n'est memorise.
    expect(q.logisticName).not.toBe('FedEx');
  });

  it('C -- AUCUN logisticName commun -> aucun palier fabrique, repli existant conserve', async () => {
    const q = await call(
      [
        row('C', [tier('eco', 'CJPacket', 3, 12, 20), tier('express', 'DHL', 9, 2, 4)], 3),
        row('D', [tier('eco', 'YunExpress', 3.5, 12, 20), tier('express', 'FedEx', 10, 2, 4)], 3.5),
      ],
      ['C', 'D']
    );
    expect(q.tiers).toBeNull();
    expect(q.selectedTier).toBeNull();
    // Aucune methode revendiquee : le nom reste vide plutot qu'emprunte au
    // premier produit.
    expect(q.logisticName).toBeNull();
    // Repli EXISTANT sur shipping_cost : (3 + 3.5) x 1.20 = 7.80
    expect(q.amount).toBe(7.8);
    expect(q.source).toBe('cache');
  });

  it('D -- MONO-produit : comportement strictement inchange', async () => {
    const q = await call(
      [row('A', [tier('eco', 'CJPacket', 3, 10, 20), tier('standard', 'CJPacket Sensitive', 5), tier('express', 'DHL', 9, 2, 4)])],
      ['A'],
      'standard'
    );
    expect(q.tiers?.map((t) => t.tier)).toEqual(['eco', 'standard', 'express']);
    expect(q.amount).toBe(6);                    // 5 x 1.20
    expect(q.logisticName).toBe('CJPacket Sensitive');
  });

  it('E -- labels partiellement communs -> seuls ceux au transporteur commun survivent', async () => {
    const q = await call(
      [
        row('A', [tier('eco', 'CJPacket', 3, 10, 20), tier('standard', 'YunExpress', 5), tier('express', 'DHL', 9, 2, 4)]),
        row('B', [tier('eco', 'CJPacket', 4, 10, 20), tier('standard', '4PX', 6), tier('express', 'DHL', 10, 2, 4)]),
      ],
      ['A', 'B'],
      'eco'
    );
    // eco (CJPacket partout) et express (DHL partout) survivent ;
    // standard (YunExpress vs 4PX) est supprime.
    expect(q.tiers?.map((t) => t.tier)).toEqual(['eco', 'express']);
    expect(q.amount).toBe(8.4);                  // (3 + 4) x 1.20
    expect(q.logisticName).toBe('CJPacket');
  });

  it('F -- nom de transporteur VIDE en multi-produits -> palier supprime', async () => {
    // Deux noms inconnus ne prouvent pas qu'il s'agit du meme transporteur.
    // On refuse plutot que de laisser deux inconnues valoir une egalite.
    const q = await call(
      [
        row('A', [tier('eco', '', 3, 10, 20)]),
        row('B', [tier('eco', '', 4, 10, 20)]),
      ],
      ['A', 'B']
    );
    expect(q.tiers).toBeNull();
  });

  it('G -- mono-produit sans nom : inchange, le palier reste propose', async () => {
    const q = await call([row('A', [tier('eco', '', 3, 10, 20)])], ['A']);
    expect(q.tiers?.map((t) => t.tier)).toEqual(['eco']);
    expect(q.logisticName).toBeNull();
  });
});
