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

const { cacheRows, basketRow, upserts, deletes, upsertFails, recentQuotes } = vi.hoisted(() => ({
  cacheRows: { value: [] as unknown[] },       // shipping_cache (par produit)
  basketRow: { value: null as unknown },       // shipping_quote_cache (par panier)
  upserts: [] as unknown[],
  deletes: [] as { col: string; val: string }[],
  upsertFails: { value: false },
  recentQuotes: { value: 0, fails: false },     // budget d'appels CJ (fenetre 60 s)
}));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      if (table === 'shipping_quote_cache') {
        chain.maybeSingle = () => Promise.resolve({ data: basketRow.value });
        chain.upsert = (row: unknown) => {
          upserts.push(row);
          if (upsertFails.value) return Promise.reject(new Error('upsert KO'));
          return Promise.resolve({ error: null });
        };
        chain.gte = () => recentQuotes.fails
          ? Promise.reject(new Error('count KO'))
          : Promise.resolve({ count: recentQuotes.value });
        chain.delete = () => chain;
        chain.lt = (col: string, val: string) => { deletes.push({ col, val }); return Promise.resolve({ error: null }); };
        return chain;
      }
      chain.in = () => Promise.resolve({ data: cacheRows.value });
      chain.then = (r: (v: unknown) => void) => r({ data: cacheRows.value });
      return chain;
    },
  },
}));

// Aucun adaptateur live : cache et devis panier sont les seules sources, ce
// qui isole exactement les chemins testes.
vi.mock('@/lib/suppliers/registry', () => ({ suppliersWithCapability: () => [] }));

const { freight } = vi.hoisted(() => ({ freight: { value: null as unknown, delayMs: 0 } }));
vi.mock('@/lib/cj/client', () => ({
  cjCalculateFreight: async () => {
    if (freight.delayMs) await new Promise((r) => setTimeout(r, freight.delayMs));
    if (freight.value instanceof Error) throw freight.value;
    return freight.value;
  },
}));

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

beforeEach(() => {
  cacheRows.value = [];
  // Par defaut le devis panier est INDISPONIBLE : les tests P0 ci-dessous
  // exercent donc le chemin de repli par produit, exactement comme avant.
  basketRow.value = null;
  freight.value = null;
  freight.delayMs = 0;
  upserts.length = 0;
  deletes.length = 0;
  upsertFails.value = false;
  recentQuotes.value = 0;
  recentQuotes.fails = false;
});

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

// ============================================================
// DEVIS PANIER -- l'extrapolation lineaire est supprimee.
//
// Chaque chiffre attendu ci-dessous provient de la mesure CJ reelle du
// 2026-08-22 (203 options, pays CA, fichiers measures/raw/) :
//   VID 1, CJPacket Ordinary : q1=6.17  q2=8.50  q10=28.80  q20=52.95
//   panier VID1+VID2 q1x1    : 9.24  contre 12.87 en somme des devis unitaires
// ============================================================

const opt = (name: string, price: number, aging: string) =>
  ({ logisticName: name, logisticPrice: price, logisticAging: aging });

/** Le cron met en cache un tarif mesure a QUANTITE 1 : c'est cette valeur que
 *  l'ancien code multipliait par la quantite. */
const CACHE_Q1 = [row('V1', [tier('eco', 'CJPacket Ordinary', 6.17, 8, 12)], 6.17)];

describe('DEVIS PANIER -- quantite : le tarif degressif reel est respecte', () => {
  it('10 unites : facture le devis panier CJ, PAS 10 x le tarif unitaire', async () => {
    cacheRows.value = CACHE_Q1;
    freight.value = [opt('CJPacket Ordinary', 28.8, '8-12')];   // mesure reelle a q10
    const q = await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 10 }] },
      countryCode: 'CA', flat: 0,
    });
    expect(q.amount).toBe(34.56);                 // 28.80 x 1.20
    // Ancien comportement : 6.17 x 10 x 1.20 = 74.04 -- l'acheteur payait
    // plus du double du cout reel.
    expect(q.amount).not.toBe(74.04);
    expect(q.logisticName).toBe('CJPacket Ordinary');
  });

  it('20 unites : idem, l ecart se creuse avec la quantite', async () => {
    cacheRows.value = CACHE_Q1;
    freight.value = [opt('CJPacket Ordinary', 52.95, '8-12')];  // mesure reelle a q20
    const q = await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 20 }] },
      countryCode: 'CA', flat: 0,
    });
    expect(q.amount).toBe(63.54);                 // 52.95 x 1.20
    expect(q.amount).not.toBe(148.08);            // 6.17 x 20 x 1.20
  });

  it('la marge x1,20 est appliquee a l identique', async () => {
    freight.value = [opt('CJPacket Ordinary', 8.5, '8-12')];
    const q = await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 2 }] },
      countryCode: 'CA', flat: 0,
    });
    expect(q.amount).toBe(10.2);                  // 8.50 x 1.20
  });
});

describe('DEVIS PANIER -- multi-produits : moins cher que la somme', () => {
  it('le panier est facture au devis CJ, jamais a la somme des devis unitaires', async () => {
    // Cache produit : 6.17 + 6.70 = 12.87 -> 15.44 avec marge (ancien calcul).
    cacheRows.value = [
      row('V1', [tier('eco', 'CJPacket Ordinary', 6.17, 8, 12)], 6.17),
      row('V2', [tier('eco', 'CJPacket Ordinary', 6.7, 8, 12)], 6.7),
    ];
    freight.value = [opt('CJPacket Ordinary', 9.24, '8-12')];   // devis panier reel
    const q = await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 1 }, { supplier_product_id: 'V2', quantity: 1 }] },
      countryCode: 'CA', flat: 0,
    });
    expect(q.amount).toBe(11.09);                 // 9.24 x 1.20
    expect(q.amount).not.toBe(15.44);             // (6.17 + 6.70) x 1.20
  });

  it('aucune intersection par logisticName : CJ ne retourne que les methodes du panier', async () => {
    freight.value = [opt('CJPacket Ordinary', 9.24, '8-12'), opt('DHL Official', 30.92, '2-4')];
    const q = await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 1 }, { supplier_product_id: 'V2', quantity: 1 }] },
      countryCode: 'CA', flat: 0,
      requestedTier: 'express',
    });
    expect(q.selectedTier).toBe('express');
    expect(q.logisticName).toBe('DHL Official');
    expect(q.amount).toBe(37.1);                  // 30.92 x 1.20
  });
});

describe('DEVIS PANIER -- cache 24 h', () => {
  it('cache frais -> aucun appel CJ, devis servi depuis le cache panier', async () => {
    basketRow.value = { options: [opt('CJPacket Ordinary', 9.24, '8-12')], updated_at: new Date().toISOString() };
    freight.value = new Error('CJ ne doit PAS etre appele');
    const q = await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 1 }] },
      countryCode: 'CA', flat: 0,
    });
    expect(q.amount).toBe(11.09);
    expect(upserts).toHaveLength(0);              // rien de reecrit
  });

  it('cache de plus de 24 h -> ignore, nouveau devis demande et memorise', async () => {
    basketRow.value = {
      options: [opt('PERIME', 1, '8-12')],
      updated_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
    };
    freight.value = [opt('CJPacket Ordinary', 9.24, '8-12')];
    const q = await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 1 }] },
      countryCode: 'CA', flat: 0,
    });
    expect(q.amount).toBe(11.09);
    expect(q.logisticName).toBe('CJPacket Ordinary');
    expect(upserts).toHaveLength(1);
    // Le devis BRUT est conserve, pas les paliers derives.
    expect((upserts[0] as any).options).toEqual([opt('CJPacket Ordinary', 9.24, '8-12')]);
    expect((upserts[0] as any).basket_hash).toMatch(/^b_v1_/);
  });
});

describe('DEVIS PANIER -- replis', () => {
  it('CJ en ECHEC -> chemin par produit, P0 intact', async () => {
    cacheRows.value = [
      row('A', [tier('eco', 'CJPacket', 3, 10, 20), tier('express', 'DHL', 9, 2, 4)]),
      row('B', [tier('eco', 'CJPacket', 4, 10, 20), tier('express', 'FedEx', 10, 2, 4)]),
    ];
    freight.value = new Error('CJ 429');
    const q = await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'A', quantity: 1 }, { supplier_product_id: 'B', quantity: 1 }] },
      countryCode: 'CA', flat: 0, requestedTier: 'express',
    });
    // P0 : express (DHL vs FedEx) reste supprime, eco (CJPacket partout) survit.
    expect(q.tiers?.map((t) => t.tier)).toEqual(['eco']);
    expect(q.amount).toBe(8.4);                   // (3 + 4) x 1.20
    expect(q.source).toBe('cache');
  });

  it('devis CJ VIDE -> chemin par produit', async () => {
    cacheRows.value = CACHE_Q1;
    freight.value = [];
    const q = await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 2 }] },
      countryCode: 'CA', flat: 0,
    });
    expect(q.amount).toBe(14.81);                 // repli : 6.17 x 2 x 1.20
  });

  it('DELAI MAXIMAL depasse -> l acheteur n attend pas, chemin par produit', async () => {
    cacheRows.value = CACHE_Q1;
    freight.value = [opt('CJPacket Ordinary', 8.5, '8-12')];
    freight.delayMs = 4000;                       // > BASKET_MAX_WAIT_MS (3000)
    const q = await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 2 }] },
      countryCode: 'CA', flat: 0,
    });
    expect(q.amount).toBe(14.81);                 // repli immediat, pas 10.20
  }, 10_000);
});

describe('DEVIS PANIER -- affiche = facture', () => {
  it('deux appels identiques (panier puis checkout) donnent le meme montant', async () => {
    cacheRows.value = CACHE_Q1;
    freight.value = [opt('CJPacket Ordinary', 28.8, '8-12')];
    const args = {
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 10 }] },
      countryCode: 'CA', flat: 0, requestedTier: 'eco',
    };
    const affiche = await resolveShipping(args);
    const facture = await resolveShipping(args);
    expect(facture.amount).toBe(affiche.amount);
    expect(facture.selectedTier).toBe(affiche.selectedTier);
    expect(facture.logisticName).toBe(affiche.logisticName);
  });
});

describe('DEVIS PANIER -- purge du cache', () => {
  it('la purge est adossee a l ECRITURE : elle s execute apres une memorisation', async () => {
    freight.value = [opt('CJPacket Ordinary', 9.24, '8-12')];
    await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 1 }] },
      countryCode: 'CA', flat: 0,
    });
    expect(upserts).toHaveLength(1);
    expect(deletes).toHaveLength(1);
    expect(deletes[0].col).toBe('updated_at');   // s'appuie sur l'index existant
  });

  it('horizon de purge = 7 jours, tres au-dela des 24 h de validite', async () => {
    freight.value = [opt('CJPacket Ordinary', 9.24, '8-12')];
    const before = Date.now();
    await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 1 }] },
      countryCode: 'CA', flat: 0,
    });
    const age = before - new Date(deletes[0].val).getTime();
    const day = 24 * 3600 * 1000;
    expect(age).toBeGreaterThanOrEqual(7 * day - 5000);
    expect(age).toBeLessThanOrEqual(7 * day + 5000);
    // Aucune entree encore SERVIE (< 24 h) ne peut entrer dans cet intervalle.
    expect(age).toBeGreaterThan(day);
  });

  it('AUCUNE purge sur un succes de cache : le chemin chaud reste intact', async () => {
    basketRow.value = { options: [opt('CJPacket Ordinary', 9.24, '8-12')], updated_at: new Date().toISOString() };
    freight.value = new Error('CJ ne doit PAS etre appele');
    const q = await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 1 }] },
      countryCode: 'CA', flat: 0,
    });
    expect(q.amount).toBe(11.09);
    expect(upserts).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });

  it('un echec d ecriture ou de purge ne degrade JAMAIS le devis rendu', async () => {
    freight.value = [opt('CJPacket Ordinary', 9.24, '8-12')];
    upsertFails.value = true;
    const q = await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 1 }] },
      countryCode: 'CA', flat: 0,
    });
    expect(q.amount).toBe(11.09);                // le devis reste juste
    expect(q.logisticName).toBe('CJPacket Ordinary');
  });
});

describe('DEVIS PANIER -- budget d appels CJ (route panier PUBLIQUE)', () => {
  const oneItem = { cj: [{ supplier_product_id: 'V1', quantity: 1 }] };

  it('sous le budget -> le devis panier est demande normalement', async () => {
    recentQuotes.value = 19;                     // < 20
    freight.value = [opt('CJPacket Ordinary', 9.24, '8-12')];
    const q = await resolveShipping({ groups: oneItem, countryCode: 'CA', flat: 0 });
    expect(q.amount).toBe(11.09);
    expect(upserts).toHaveLength(1);
  });

  it('BUDGET ATTEINT -> aucun appel CJ, repli par produit, l acheteur garde un devis', async () => {
    recentQuotes.value = 20;
    cacheRows.value = CACHE_Q1;
    freight.value = new Error('CJ ne doit PAS etre appele');   // leve si atteint
    const q = await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 2 }] },
      countryCode: 'CA', flat: 0,
    });
    expect(q.amount).toBe(14.81);                // repli : 6.17 x 2 x 1.20
    expect(upserts).toHaveLength(0);             // rien n'a ete devise
  });

  it('un panier DEJA CONNU n est jamais soumis au budget', async () => {
    // Propriete essentielle : le budget ne freine que les paniers INEDITS,
    // c'est-a-dire exactement la forme de l'abus. Un acheteur legitime qui
    // reaffiche son panier passe par le cache et n'est jamais ralenti.
    recentQuotes.value = 10_000;                 // tres au-dela du budget
    basketRow.value = { options: [opt('CJPacket Ordinary', 9.24, '8-12')], updated_at: new Date().toISOString() };
    freight.value = new Error('CJ ne doit PAS etre appele');
    const q = await resolveShipping({ groups: oneItem, countryCode: 'CA', flat: 0 });
    expect(q.amount).toBe(11.09);                // servi par le cache
    expect(q.logisticName).toBe('CJPacket Ordinary');
  });

  it('budget indeterminable -> repli, jamais un appel CJ suppose autorise', async () => {
    recentQuotes.fails = true;
    cacheRows.value = CACHE_Q1;
    freight.value = new Error('CJ ne doit PAS etre appele');
    const q = await resolveShipping({
      groups: { cj: [{ supplier_product_id: 'V1', quantity: 2 }] },
      countryCode: 'CA', flat: 0,
    });
    expect(q.amount).toBe(14.81);
  });
});
