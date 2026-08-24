// src/lib/__tests__/checkStockInventoryPolicy.test.ts
//
// ÉTAPE 5 / 8 du chantier catalogue canonique — `checkStock()` respecte la
// politique d'inventaire.
//
// ============================================================
// POURQUOI CE FICHIER EXISTE.
//
// `checkStock()` n'avait AUCUN test unitaire : il est systématiquement mocké
// dans les tests de route (`shop/checkout`, `a6SupplierAdapters`,
// `mode2EndToEnd`), qui prouvent que la route réagit à son verdict — jamais
// comment ce verdict est produit. Le prédicat lui-même n'était donc protégé
// par rien.
//
// CE QUE L'ÉTAPE 5 CHANGE. Depuis l'étape 4, la base ignore les lignes
// `track_inventory = false` au décrément — sans erreur, sans marquage. Sans
// ce correctif, la pré-vérification refuserait toujours ces produits
// (`stock` inerte, souvent 0), et la vente sans compteur serait
// structurellement impossible.
//
// LA DIRECTION DE L'ERREUR N'EST PAS SYMÉTRIQUE, et c'est ce que ces tests
// verrouillent :
//   · checkStock PLUS STRICT que le décrément  -> vente perdue. Sans danger.
//   · checkStock PLUS PERMISSIF que le décrément -> l'acheteur paie, le
//     décrément échoue, `handlePaidCheckout` rembourse intégralement.
// C'est pourquoi la garde s'écrit `!== false` et non `=== true`.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const produits = new Map<string, unknown>();
const fromMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...a) },
}));

import { checkStock } from '../shop';

/** Reproduit la chaîne réelle de getProduct : from().select().eq().maybeSingle(). */
function chain() {
  let idDemande: string | null = null;
  const c: Record<string, unknown> = {};
  c.select = vi.fn(() => c);
  c.eq = vi.fn((_col: string, val: string) => {
    idDemande = val;
    return c;
  });
  c.maybeSingle = vi.fn(async () => ({
    data: idDemande !== null ? (produits.get(idDemande) ?? null) : null,
    error: null,
  }));
  return c;
}

/** Enregistre un produit. Par défaut : SUIVI, stock 5 — l'état historique. */
function produit(id: string, surcharge: Record<string, unknown> = {}) {
  produits.set(id, {
    id,
    site_id: 'site-1',
    name: `Produit ${id}`,
    description: null,
    price: 10,
    currency: 'CAD',
    images: [],
    stock: 5,
    track_inventory: true,
    published: true,
    position: 0,
    created_at: '',
    ...surcharge,
  });
}

beforeEach(() => {
  produits.clear();
  fromMock.mockReset().mockImplementation(chain);
});

describe('checkStock — produit SUIVI : le compteur fait autorité (comportement historique)', () => {
  it('stock suffisant -> accepté', async () => {
    produit('p1', { stock: 5 });
    expect(await checkStock([{ id: 'p1', quantity: 3 }])).toEqual({ ok: true });
  });

  it('stock insuffisant -> refusé, avec la raison exacte', async () => {
    produit('p1', { stock: 2, name: 'T-Shirt' });
    const r = await checkStock([{ id: 'p1', quantity: 5 }]);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toBe('Stock insuffisant pour "T-Shirt" (2 disponible)');
  });

  it('stock 0 -> refusé', async () => {
    produit('p1', { stock: 0 });
    expect((await checkStock([{ id: 'p1', quantity: 1 }])).ok).toBe(false);
  });

  it('quantité exactement égale au stock -> accepté (la borne reste inclusive)', async () => {
    produit('p1', { stock: 4 });
    expect(await checkStock([{ id: 'p1', quantity: 4 }])).toEqual({ ok: true });
  });
});

describe('checkStock — produit NON SUIVI : aucun contrôle de quantité', () => {
  // Le cœur de l'étape 5. Avant ce correctif, chacun de ces cas était refusé.
  it('stock 0 -> ACCEPTÉ (vente sans compteur : `stock` est inerte, pas une rupture)', async () => {
    produit('p1', { stock: 0, track_inventory: false });
    expect(
      await checkStock([{ id: 'p1', quantity: 1 }]),
      "un produit vendu sans compteur ne peut pas être « en rupture » : le refuser rendrait la vente sur commande impossible"
    ).toEqual({ ok: true });
  });

  it('quantité très supérieure au stock -> ACCEPTÉ', async () => {
    produit('p1', { stock: 1, track_inventory: false });
    expect(await checkStock([{ id: 'p1', quantity: 999 }])).toEqual({ ok: true });
  });

  it("le produit n'est pas refusé pour une autre raison silencieuse", async () => {
    produit('p1', { stock: 0, track_inventory: false });
    const r = await checkStock([{ id: 'p1', quantity: 50 }]);
    expect(r).toEqual({ ok: true });
  });
});

describe('checkStock — commande MIXTE : chaque ligne selon sa propre politique', () => {
  it('ligne suivie suffisante + ligne non suivie à stock 0 -> accepté', async () => {
    produit('suivi', { stock: 10 });
    produit('libre', { stock: 0, track_inventory: false });
    expect(
      await checkStock([{ id: 'suivi', quantity: 2 }, { id: 'libre', quantity: 7 }]),
      'la ligne non suivie ne doit pas faire échouer une commande dont la ligne suivie est servable'
    ).toEqual({ ok: true });
  });

  it('ligne suivie INSUFFISANTE + ligne non suivie -> refusé (la ligne suivie prime)', async () => {
    produit('suivi', { stock: 1, name: 'Mug' });
    produit('libre', { stock: 0, track_inventory: false });
    const r = await checkStock([{ id: 'suivi', quantity: 9 }, { id: 'libre', quantity: 3 }]);
    expect(
      r.ok,
      "le fait qu'une autre ligne soit non suivie ne relâche jamais le contrôle sur une ligne suivie"
    ).toBe(false);
    expect((r as { reason: string }).reason).toBe('Stock insuffisant pour "Mug" (1 disponible)');
  });
});

describe('checkStock — FAIL-CLOSED : une politique absente durcit le contrôle, jamais l’inverse', () => {
  // `!== false` et non `=== true`. Si `track_inventory` disparaissait de la
  // lecture (select restreint, donnée partielle), `=== true` skipperait TOUS
  // les contrôles de stock — c'est-à-dire deviendrait PLUS PERMISSIF que le
  // décrément, la seule direction qui coûte de l'argent.
  it('track_inventory absent + stock insuffisant -> REFUSÉ', async () => {
    produit('p1', { stock: 1, track_inventory: undefined });
    expect(
      (await checkStock([{ id: 'p1', quantity: 5 }])).ok,
      "une politique d'inventaire inconnue ne doit jamais autoriser ce que le décrément refusera"
    ).toBe(false);
  });

  it('track_inventory absent + stock suffisant -> accepté (aucun refus gratuit)', async () => {
    produit('p1', { stock: 9, track_inventory: undefined });
    expect(await checkStock([{ id: 'p1', quantity: 2 }])).toEqual({ ok: true });
  });
});

describe('checkStock — non-régression du comportement existant', () => {
  it('ligne catalogue ("catalog-") -> ignorée, aucune lecture produit', async () => {
    const r = await checkStock([{ id: 'catalog-abc::v1', quantity: 3 }]);
    expect(r).toEqual({ ok: true });
    expect(fromMock, 'le stock des biens fournisseurs est hors du périmètre de checkStock').not.toHaveBeenCalled();
  });

  it('produit introuvable -> refusé', async () => {
    const r = await checkStock([{ id: 'inconnu', quantity: 1 }]);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toBe('Produit introuvable');
  });

  it('liste vide -> accepté, aucune lecture', async () => {
    expect(await checkStock([])).toEqual({ ok: true });
    expect(fromMock).not.toHaveBeenCalled();
  });
});
