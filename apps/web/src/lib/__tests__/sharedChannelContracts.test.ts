// src/lib/__tests__/sharedChannelContracts.test.ts
//
// PHASE 7 du chantier de séparation Mode 2 / Mode 3.
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md, §4.
//
// ============================================================
// LES CANAUX CORRÉLÉS — CONTRATS À DEUX FORMES DE DONNÉES.
//
// Le §4 recense la surface exhaustive du risque résiduel : quatre composants
// SHARED reçoivent une donnée dont la VALEUR est corrélée au mode, alors que
// le composant, lui, ne connaît aucun mode. C'est légitime — mais tant que
// chacun n'est pas exercé sous LES DEUX FORMES, rien ne prouve que son
// comportement est correct dans les deux, ni qu'il ne dérivera pas vers une
// règle propre à un mode. Le plan les classe pour cette raison en classe C.
//
// MESURE PRÉALABLE — ce fichier ne couvre QUE les lacunes réellement
// mesurées, jamais un canal déjà prouvé :
//
//   canal 1 `decrementStock`  → DÉJÀ prouvé aux deux formes (shop.test.ts) ;
//   canal 1 `checkStock`      → NON prouvé : aucun test ne lui donne de ligne
//                               `catalog-` ;
//   canal 2 `logAnomaly`      → NON prouvé : aucun test dédié ;
//   canal 3 `createCheckout`  → DÉJÀ prouvé à TROIS formes (omis, 0, > 0)
//                               dans stripeCreateCheckoutCommission.test.ts ;
//   canal 4 `sitePricing`     → NON prouvé : AUCUN fichier de test ;
//   canal 5 neutralité        → NON prouvé : la neutralité est affirmée au
//                               plan, jamais exercée.
//
// Les canaux 1-`decrementStock` et 3 ne sont donc pas re-testés ici : les
// redoubler n'ajouterait rien et diluerait la preuve.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn();
const fromMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => sendMock(...a) };
  },
}));

import { checkStock } from '@/lib/shop';
import { logAnomaly } from '@/lib/anomaly';
import { sitePricing, DEFAULT_MARGIN_PERCENT, DEFAULT_ROUND_MODE } from '@/lib/pricing';
import { buildBasketHash } from '@/lib/shop/quote/basketHash';
import { isLegalOrderStatusTransition, countsAsRevenue } from '@/lib/shop/orderStatusMachine';

/** Chaîne Supabase minimale, paramétrable par table. */
function chain(response: { data?: unknown; error?: unknown; count?: number }) {
  const c: Record<string, unknown> = {};
  const self = () => c;
  // `neq` compris : `logAnomaly` l'utilise (anomaly.ts:79). Sans lui,
  // l'exception serait avalée par le try/catch et l'alerte muette.
  for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'order', 'limit', 'is']) c[m] = vi.fn(self);
  c.insert = vi.fn((payload: unknown) => {
    insertMock(payload);
    return c;
  });
  c.single = vi.fn(async () => response);
  c.maybeSingle = vi.fn(async () => response);
  c.then = (resolve: (v: unknown) => void) => resolve({ count: 0, error: null, ...response });
  return c;
}

beforeEach(() => {
  fromMock.mockReset();
  insertMock.mockReset();
  sendMock.mockReset().mockResolvedValue({ id: 'em_1' });
  process.env.RESEND_API_KEY = 'test-key';
  process.env.ALERT_EMAIL_TO = 'ops@test.com';
});

// ============================================================
// CANAL 1 (moitié non prouvée) — `checkStock` ← préfixe `catalog-`
// ============================================================
// Le composant est SHARED et branche pourtant sur le préfixe : une ligne
// `catalog-` est ignorée, car le marchand ne détient aucun stock local pour
// elle. C'est correct — mais c'est exactement une décision prise sur un
// signal corrélé au mode, et elle n'était exercée que dans un sens.
describe('Canal 1 — checkStock, deux formes de données', () => {
  function produit(stock: number) {
    fromMock.mockImplementation(() => chain({ data: { id: 'p1', name: 'T-Shirt', stock }, error: null }));
  }

  it('FORME MODE 3 — lignes de catalogue : aucune lecture de stock local, jamais de refus', async () => {
    fromMock.mockImplementation(() => chain({ data: null, error: null }));
    const r = await checkStock([{ id: 'catalog-abc::v1', quantity: 99 }]);
    expect(r).toEqual({ ok: true });
    expect(
      fromMock,
      "un produit de catalogue n'a pas de stock local : le consulter serait interroger une donnée qui n'existe pas"
    ).not.toHaveBeenCalled();
  });

  it('FORME MODE 2 — produits du marchand : le stock local fait foi', async () => {
    produit(5);
    await expect(checkStock([{ id: 'p1', quantity: 5 }])).resolves.toEqual({ ok: true });
    expect(fromMock, 'le stock du marchand doit réellement être lu').toHaveBeenCalled();
  });

  it('FORME MODE 2 — stock insuffisant : refus explicite', async () => {
    produit(1);
    const r = await checkStock([{ id: 'p1', quantity: 3 }]);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toContain('Stock insuffisant');
  });

  it('FORME MIXTE — seule la ligne marchande est vérifiée', async () => {
    produit(10);
    const r = await checkStock([{ id: 'catalog-abc', quantity: 50 }, { id: 'p1', quantity: 2 }]);
    expect(r).toEqual({ ok: true });
    expect(
      fromMock.mock.calls.length,
      'exactement une lecture : la ligne de catalogue ne doit en déclencher aucune'
    ).toBe(1);
  });
});

// ============================================================
// CANAL 2 — `logAnomaly` ← `type`
// ============================================================
// Le type porte le mode : les types `cj_*` ne surviennent qu'en Mode 3, et
// certains figurent dans une allowlist qui contourne l'anti-spam. C'est un
// branchement SHARED sur une valeur corrélée au mode.
//
// LE CONTRAT : la PERSISTANCE doit être identique pour les deux formes —
// c'est elle qui alimente la surveillance. Seule l'ALERTE diffère.
describe('Canal 2 — logAnomaly, deux formes de données', () => {
  it('FORME MODE 3 (type `cj_*` en allowlist) — alerte envoyée MÊME au-delà du seuil anti-spam', async () => {
    fromMock.mockImplementation(() => chain({ data: null, error: null, count: 5 }));
    await logAnomaly({ type: 'cj_fulfill_exhausted', severity: 'blocked', siteId: 's1' });
    expect(insertMock, "l'anomalie doit être persistée").toHaveBeenCalledTimes(1);
    expect(sendMock, "cette famille de types contourne délibérément l'anti-spam").toHaveBeenCalledTimes(1);
  });

  it('FORME NEUTRE (type hors allowlist) — persistée pareillement, mais alerte étouffée au-delà du seuil', async () => {
    fromMock.mockImplementation(() => chain({ data: null, error: null, count: 5 }));
    await logAnomaly({ type: 'zero_amount_checkout', severity: 'blocked', siteId: 's1' });
    expect(
      insertMock,
      "la persistance ne dépend PAS du type : c'est elle qui alimente la surveillance"
    ).toHaveBeenCalledTimes(1);
    expect(sendMock, "l'anti-spam s'applique aux types ordinaires").not.toHaveBeenCalled();
  });

  it('les deux formes produisent la MÊME structure de ligne persistée', async () => {
    fromMock.mockImplementation(() => chain({ data: null, error: null, count: 0 }));
    await logAnomaly({ type: 'cj_fulfill_exhausted', severity: 'warning', siteId: 's1', slug: 'b' });
    await logAnomaly({ type: 'zero_amount_checkout', severity: 'warning', siteId: 's1', slug: 'b' });
    const [a, b] = insertMock.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect({ ...a, type: null }).toEqual({ ...b, type: null });
  });
});

// ============================================================
// CANAL 4 — `sitePricing` ← `cj_margin_percent`
// ============================================================
// Colonne renseignée en Mode 3, inerte (null) en Mode 2. Aucun test ne
// couvrait ce composant — mesuré : zéro fichier.
describe('Canal 4 — sitePricing, deux formes de données', () => {
  it('FORME MODE 2 — colonne inerte : repli sur les valeurs par défaut', () => {
    expect(sitePricing({ cj_margin_percent: null, cj_round_mode: null })).toEqual({
      margin: DEFAULT_MARGIN_PERCENT,
      roundMode: DEFAULT_ROUND_MODE,
    });
  });

  it('FORME MODE 3 — colonne renseignée : la valeur du marchand prime', () => {
    expect(sitePricing({ cj_margin_percent: 35, cj_round_mode: 'psy99' })).toEqual({
      margin: 35,
      roundMode: 'psy99',
    });
  });

  it('marge à 0 conservée — `??` et non `||` : zéro est une marge, pas une absence', () => {
    expect(sitePricing({ cj_margin_percent: 0 }).margin).toBe(0);
  });

  it('champ absent traité comme absent, jamais comme zéro', () => {
    expect(sitePricing({}).margin).toBe(DEFAULT_MARGIN_PERCENT);
  });
});

// ============================================================
// CANAL 5 — la neutralité affirmée par le plan, exercée
// ============================================================
// Le §4 déclare `orderStatusMachine`, `basketHash` et `checkoutSignature`
// neutres. Vérifié structurellement : aucun de ces fichiers ne contient de
// branchement sur `catalog-`, `cj_` ou un mode. Ce bloc l'exerce.
describe('Canal 5 — neutralité, exercée sur les deux formes', () => {
  it('buildBasketHash : même empreinte quel que soit l’ORDRE, pour les deux formes d’identifiant', () => {
    const cj = [{ supplier_product_id: 'vid-1', quantity: 1 }, { supplier_product_id: 'vid-2', quantity: 2 }];
    const pod = [{ supplier_product_id: 'PF-9', quantity: 1 }, { supplier_product_id: 'GL-4', quantity: 2 }];
    expect(buildBasketHash(cj)).toBe(buildBasketHash([...cj].reverse()));
    expect(buildBasketHash(pod)).toBe(buildBasketHash([...pod].reverse()));
  });

  it('buildBasketHash : deux paniers distincts ne collisionnent pas', () => {
    expect(buildBasketHash([{ supplier_product_id: 'vid-1', quantity: 1 }])).not.toBe(
      buildBasketHash([{ supplier_product_id: 'vid-1', quantity: 2 }])
    );
  });

  it('orderStatusMachine : les transitions ne dépendent que du statut', () => {
    expect(isLegalOrderStatusTransition('pending', 'paid')).toBe(true);
    expect(isLegalOrderStatusTransition('delivered', 'pending')).toBe(false);
  });

  it('countsAsRevenue : identique pour une commande marchande et une commande fournisseur', () => {
    for (const statut of ['paid', 'processing', 'shipped', 'delivered']) {
      expect(countsAsRevenue(statut)).toBe(true);
    }
    for (const statut of ['pending', 'canceled', 'refunded']) {
      expect(countsAsRevenue(statut)).toBe(false);
    }
  });
});
