import { describe, it, expect } from 'vitest';
import { pickThreeTiers, parseAging, lowestPrice, type ShippingTier } from '../shipping-tiers';

// ============================================================
// LOT 4-TER -- ce fichier n'existait pas : pickThreeTiers() n'avait AUCUN
// test direct, alors qu'elle decide de ce que l'acheteur voit et paie.
//
// L'ancien algorithme violait au moins un invariant d'echelle de service
// dans 388 tirages aleatoires sur 1000 (38,8 %). Le test par proprietes en
// fin de fichier est la garde qui empeche toute reintroduction : il echoue
// des qu'UNE propriete est violee sur UN seul des 1000 tirages.
// ============================================================

type Opt = { logisticName: string; logisticPrice: number; logisticAging: string };
const o = (name: string, price: number, aging: string): Opt => ({
  logisticName: name, logisticPrice: price, logisticAging: aging,
});
const ORDER = ['eco', 'standard', 'express'] as const;
const pick = (t: ShippingTier[] | null, k: string) => (t ?? []).find((x) => x.tier === k);

/**
 * Les six invariants d'une echelle de service. Un palier qui les viole n'est
 * pas une option commerciale : c'est un piege pour l'acheteur.
 */
function invariantViolations(tiers: ShippingTier[] | null, input: Opt[]): string[] {
  const list = tiers ?? [];
  const v: string[] = [];
  const seq = ORDER.map((k) => list.find((t) => t.tier === k)).filter(Boolean) as ShippingTier[];

  // I1 -- eco est la moins chere PARMI LES OPTIONS EXPLOITABLES (cout fini >= 0
  // ET delai utilisable). Une option sans delai ne porte pas de niveau de
  // service : elle est hors classement, donc hors invariant.
  const usable = input.filter((x) => {
    const { max } = parseAging(x.logisticAging);
    return Number.isFinite(x.logisticPrice) && x.logisticPrice >= 0 && max != null && max > 0;
  });
  const eco = pick(list, 'eco');
  if (eco && usable.length > 0) {
    const min = Math.min(...usable.map((x) => x.logisticPrice));
    if (eco.cost !== min) v.push('I1_eco_pas_le_moins_cher');
  }
  // I2 -- prix strictement croissants
  for (let i = 1; i < seq.length; i++) if (seq[i].cost <= seq[i - 1].cost) v.push('I2_prix_non_strictement_croissants');
  // I3 -- delais strictement decroissants
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1].days_max, b = seq[i].days_max;
    if (a != null && b != null && b >= a) v.push('I3_delais_non_strictement_decroissants');
  }
  // I4 -- aucun palier domine
  for (const a of list) for (const b of list) {
    if (a === b) continue;
    if (a.cost > b.cost && (a.days_max ?? 0) >= (b.days_max ?? 0)) v.push('I4_palier_domine');
  }
  // I5 -- delai affiche > 0, ou null. Jamais 0, jamais invente.
  for (const t of list) {
    if (t.days_max != null && t.days_max <= 0) v.push('I5_delai_nul_ou_negatif');
    if (t.days_min != null && t.days_max != null && t.days_min > t.days_max) v.push('I5_min_superieur_max');
  }
  // I6 -- chaque palier correspond a une option CJ reelle
  for (const t of list) {
    if (!input.some((x) => x.logisticName === t.name && x.logisticPrice === t.cost)) v.push('I6_palier_fantome');
  }
  return [...new Set(v)];
}

// ------------------------------------------------------------
describe('parseAging -- un delai inconnu vaut null, jamais 0', () => {
  it.each([
    ['7-15', { min: 7, max: 15 }],
    ['7', { min: 7, max: 7 }],
    ['2 - 5', { min: 2, max: 5 }],
    ['15-7', { min: 7, max: 15 }],          // intervalle inverse -> normalise
    ['0-5', { min: 0, max: 5 }],            // parseur neutre : la regle metier est dans pickThreeTiers
    ['-5', { min: 5, max: 5 }],
    ['', { min: null, max: null }],         // AVANT LOT 4-TER : { min: 0, max: 0 } -> "0-0 jours" affiche
    ['   ', { min: null, max: null }],      // AVANT : { min: 0, max: 0 }
    ['n/a', { min: null, max: null }],
    ['abc-def', { min: null, max: null }],
  ])('parseAging(%j)', (input, expected) => {
    expect(parseAging(input)).toEqual(expected);
  });

  it.each([null, undefined, 42, {}, []])('valeur non textuelle (%j) -> null', (input) => {
    expect(parseAging(input)).toEqual({ min: null, max: null });
  });
});

// ------------------------------------------------------------
describe('pickThreeTiers -- nombre de paliers dicte par les donnees, jamais force', () => {
  it('1 seule option -> 1 palier (aucun niveau fabrique)', () => {
    const r = pickThreeTiers([o('A', 4, '7-15')]);
    expect(r).toHaveLength(1);
    expect(r![0].tier).toBe('eco');
  });

  it('2 options Pareto-optimales -> eco + express, PAS de standard invente', () => {
    const r = pickThreeTiers([o('A', 4, '10-20'), o('B', 8, '3-5')])!;
    expect(r.map((t) => t.tier)).toEqual(['eco', 'express']);
  });

  it('3 options Pareto-optimales -> les 3 niveaux', () => {
    const r = pickThreeTiers([o('A', 4, '10-20'), o('B', 6, '6-10'), o('C', 9, '3-5')])!;
    expect(r.map((t) => t.tier)).toEqual(['eco', 'standard', 'express']);
  });

  it('toutes les options sauf une sont DOMINEES -> 1 seul palier', () => {
    // A est moins chere ET plus rapide que B, C et D : aucune des trois n'a de
    // raison d'etre proposee. L'ancien algorithme en affichait une seconde.
    const r = pickThreeTiers([o('A', 4, '5-9'), o('B', 6, '10-15'), o('C', 8, '12-20'), o('D', 10, '15-25')])!;
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('A');
  });

  it('100 options -> 3 paliers, express reellement le plus rapide de la frontiere', () => {
    const opts = Array.from({ length: 100 }, (_, i) =>
      o(`L${i}`, 2 + i * 0.4, `${40 - Math.floor(i / 3)}-${45 - Math.floor(i / 3)}`)
    );
    const r = pickThreeTiers(opts)!;
    expect(r).toHaveLength(3);
    expect(invariantViolations(r, opts)).toEqual([]);
    // AVANT LOT 4-TER : le plafond a 3x eco retenait un express a 37-42 jours.
    expect(pick(r, 'express')!.days_max!).toBeLessThan(20);
  });
});

// ------------------------------------------------------------
describe('pickThreeTiers -- regressions mesurees de l\'ancien algorithme', () => {
  it("option tres chere mais tres rapide : n'est plus masquee par un plafond arbitraire", () => {
    // AVANT : cap = 3 x 3 = 9 -> DHL (60 $) exclu -> UN SEUL palier, 30-45 jours.
    const opts = [o('LENT', 3, '30-45'), o('DHL', 60, '1-2')];
    const r = pickThreeTiers(opts)!;
    expect(r.map((t) => t.tier)).toEqual(['eco', 'express']);
    expect(pick(r, 'express')!.name).toBe('DHL');
  });

  it("option quasi gratuite et tres lente : n'efface plus toute l'offre", () => {
    // AVANT : eco = 0,50 $ -> cap = 1,50 $ -> l'option a 5-9 jours disparaissait.
    const opts = [o('BATEAU', 0.5, '60-90'), o('B', 8, '5-9')];
    const r = pickThreeTiers(opts)!;
    expect(r).toHaveLength(2);
    expect(pick(r, 'express')!.name).toBe('B');
  });

  it('option GRATUITE : ne fait plus s\'effondrer les paliers a 0 €', () => {
    // AVANT : cap = 0 x 3 = 0 -> un seul palier a 0 €, livraison facturee zero
    // pendant que Nexiora avance le cout reel.
    const opts = [o('FREE', 0, '25-40'), o('B', 5, '7-12'), o('C', 9, '3-5')];
    const r = pickThreeTiers(opts)!;
    expect(r).toHaveLength(3);
    expect(pick(r, 'eco')!.cost).toBe(0);
    expect(invariantViolations(r, opts)).toEqual([]);
  });

  it('CAS PRODUCTION : Standard n\'est plus plus cher qu\'Express a delai egal', () => {
    // Observe en production : eco 3,77 (7-15) / standard 4,23 (4-7) / express 4,19 (4-7).
    // Standard etait plus CHER qu'Express pour EXACTEMENT le meme delai.
    const opts = [
      o('CJPacket Ordinary', 3.77, '7-15'),
      o('CJPacket Sensitive', 4.23, '4-7'),
      o('DHL', 4.19, '4-7'),
    ];
    const r = pickThreeTiers(opts)!;
    expect(invariantViolations(r, opts)).toEqual([]);
    // CJPacket Sensitive est dominee par DHL (plus chere, meme delai) : ecartee.
    expect(r.map((t) => t.name)).not.toContain('CJPacket Sensitive');
  });
});

// ------------------------------------------------------------
describe('pickThreeTiers -- donnees CJ anormales', () => {
  it.each([
    ['cout negatif', [o('A', -5, '5-9'), o('B', 4, '7-12')]],
    ['NaN', [o('A', NaN, '5-9'), o('B', 4, '7-12')]],
    ['Infinity', [o('A', Infinity, '5-9'), o('B', 4, '7-12')]],
  ])('%s -> option ecartee, aucun palier corrompu', (_n, opts) => {
    const r = pickThreeTiers(opts)!;
    expect(r.every((t) => Number.isFinite(t.cost) && t.cost >= 0)).toBe(true);
    expect(invariantViolations(r, opts as Opt[])).toEqual([]);
  });

  it('aging vide : l\'option est ecartee du classement, aucun "0-0 jours"', () => {
    const opts = [o('SANS_DELAI', 4, ''), o('B', 6, '5-9')];
    const r = pickThreeTiers(opts)!;
    expect(r.every((t) => t.days_max === null || t.days_max > 0)).toBe(true);
    expect(r.map((t) => t.name)).not.toContain('SANS_DELAI');
  });

  it('AUCUNE option datee -> la moins chere, delai null (jamais invente)', () => {
    const r = pickThreeTiers([o('A', 9, ''), o('B', 4, 'n/a')])!;
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('B');
    expect(r[0].days_min).toBeNull();
    expect(r[0].days_max).toBeNull();
  });

  it('noms dupliques : plus d\'exclusion mutuelle par nom', () => {
    const opts = [o('CJPacket', 4, '10-20'), o('CJPacket', 6, '5-9'), o('C', 9, '3-5')];
    const r = pickThreeTiers(opts)!;
    expect(invariantViolations(r, opts)).toEqual([]);
    expect(r).toHaveLength(3);
  });

  it('aucune option exploitable -> null', () => {
    expect(pickThreeTiers([])).toBeNull();
    expect(pickThreeTiers([o('A', NaN, '')])).toBeNull();
    expect(pickThreeTiers('pas un tableau')).toBeNull();
  });
});

// ------------------------------------------------------------
describe('pickThreeTiers -- determinisme et egalites', () => {
  const opts = [o('B', 5, '5-9'), o('A', 5, '5-9'), o('C', 5, '5-9')];

  it('resultat identique sur 50 appels consecutifs', () => {
    const ref = JSON.stringify(pickThreeTiers(opts));
    for (let i = 0; i < 50; i++) expect(JSON.stringify(pickThreeTiers(opts))).toBe(ref);
  });

  it("l'ordre du tableau CJ ne decide pas du resultat quand les options sont equivalentes", () => {
    // Departage documente : cout, puis delai max, puis delai min, puis nom.
    // Sans lui, l'ordre arbitraire renvoye par CJ trancherait silencieusement.
    const a = pickThreeTiers([...opts]);
    const b = pickThreeTiers([...opts].reverse());
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a![0].name).toBe('A');
  });

  it('egalite de prix, delais differents -> un seul survivant Pareto par niveau de delai', () => {
    const eq = [o('X', 5, '10-20'), o('Y', 5, '6-10'), o('Z', 5, '3-5')];
    const r = pickThreeTiers(eq)!;
    // Meme prix : seule la plus rapide n'est pas dominee.
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('Z');
  });
});

// ------------------------------------------------------------
describe('pickThreeTiers -- PROPERTY-BASED : 1000 tirages, I1 a I6', () => {
  /** Generateur deterministe (LCG) : rejouable a l'identique en CI. */
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  it('aucune violation d\'invariant sur 1000 tirages (ancien algorithme : 388)', () => {
    const rand = rng(20260822);
    const failures: string[] = [];
    for (let k = 0; k < 1000; k++) {
      const n = 1 + Math.floor(rand() * 12);
      const opts: Opt[] = Array.from({ length: n }, (_, i) => {
        const price = Math.round(rand() * 4000) / 100;
        const dmin = 1 + Math.floor(rand() * 30);
        const dmax = dmin + Math.floor(rand() * 20);
        return o(`L${i}`, price, `${dmin}-${dmax}`);
      });
      const v = invariantViolations(pickThreeTiers(opts), opts);
      if (v.length) failures.push(`tirage ${k}: ${v.join(',')} | ${JSON.stringify(opts)}`);
    }
    expect(failures.slice(0, 3)).toEqual([]);
    expect(failures).toHaveLength(0);
  });

  it('1000 tirages incluant valeurs anormales : jamais de delai <= 0, jamais de palier fantome', () => {
    const rand = rng(777);
    const agings = ['', '   ', 'n/a', '7', '7-15', '15-7', '0-5', '-5', 'abc'];
    for (let k = 0; k < 1000; k++) {
      const n = 1 + Math.floor(rand() * 8);
      const opts: Opt[] = Array.from({ length: n }, (_, i) => {
        const r = rand();
        const price = r < 0.05 ? 0 : r < 0.1 ? -1 : r < 0.15 ? NaN : Math.round(rand() * 3000) / 100;
        return o(`N${i}`, price, agings[Math.floor(rand() * agings.length)]);
      });
      const v = invariantViolations(pickThreeTiers(opts), opts);
      expect(v, `tirage ${k}: ${JSON.stringify(opts)}`).toEqual([]);
    }
  });
});

// ------------------------------------------------------------
describe('lowestPrice -- comportement inchange (hors perimetre LOT 4-TER)', () => {
  it('retourne la moins chere et son aging brut', () => {
    expect(lowestPrice([o('A', 9, '3-5'), o('B', 4, '10-20')])).toEqual({ price: 4, aging: '10-20' });
  });
  it('ignore les couts invalides', () => {
    expect(lowestPrice([o('A', -1, '3-5'), o('B', 4, '10-20')])).toEqual({ price: 4, aging: '10-20' });
  });
  it('aucune option valide -> null', () => {
    expect(lowestPrice([])).toBeNull();
  });
});
