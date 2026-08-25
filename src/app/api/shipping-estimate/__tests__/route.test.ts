import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// LOT K (Mode 3 global, fuites d'info) -- première couverture de cette
// route (aucune avant ce lot). Verrouille le correctif : le coût de
// livraison brut (cost/logisticPrice) ne doit plus jamais quitter le
// serveur -- le seul appelant réel (ShippingEstimate.tsx) ne lit que le
// délai (logisticAging).

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.single = vi.fn(async () => response);
  chain.maybeSingle = vi.fn(async () => response);
  // Requete de comptage : .select('id', {count}).eq().eq().gte() -> { count }
  chain.gte = vi.fn(async () => response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (...args: unknown[]) => fromMock(...(args as [string])) }),
}));

const logAnomalyMock = vi.fn();
vi.mock('@/lib/anomaly', () => ({ logAnomaly: (...a: unknown[]) => logAnomalyMock(...a) }));

const cjCalculateFreightMock = vi.fn();
vi.mock('@/lib/cj/client', () => ({
  cjCalculateFreight: (...a: unknown[]) => cjCalculateFreightMock(...a),
}));

import { POST } from '../route';

function req(body: unknown) {
  return new NextRequest('https://woorri.test/api/shipping-estimate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  fromMock.mockReset();
  cjCalculateFreightMock.mockReset();
  // DETTE 6b -- ajoute ici parce que ce lot est le premier a OBSERVER
  // `logAnomaly` (« un refus ne journalise rien »). Aucun test anterieur ne
  // l'assertait : leur sens est strictement inchange.
  logAnomalyMock.mockReset();
  process.env.CJ_EMAIL = 'test@example.com';
  process.env.CJ_API_KEY = 'test-key';
});

// M1-06 : la route verifie desormais que le `vid` appartient au site
// (`shop_products`) et compte les appels recents (`checkout_anomalies`).
// Ces deux tables sont donc ajoutees au harnais -- fixture, pas assertion :
// aucun test existant ne change de sens.
// ============================================================
// DETTE 6b -- LA FIXTURE `shop_products` APPLIQUE MAINTENANT LES FILTRES.
//
// L'ancienne chaine rendait la ligne quelle que soit la requete : les
// `.eq()` etaient enregistres puis ignores. Avec elle, un test de `for_sale`
// n'aurait rien prouve -- l'auteur du test aurait DECIDE la reponse en
// passant `owned: null`, et l'assertion aurait tenu avec ou sans le
// `.eq('for_sale', true)` dans la route. Ici la ligne n'est rendue que si
// TOUS les filtres poses par la route l'apparient : c'est la REQUETE qui
// est sous test, pas la premisse du test. Mesure : la suppression de
// `.eq('for_sale', true)` fait rougir 3 tests (mutation 6b-M1).
// Les tests M1-06 anterieurs gardent exactement leur sens -- site-1 / v1 /
// publie / vendable apparient toujours.
// ============================================================
function filteringChain(row: Record<string, unknown> | null) {
  const filters: [string, unknown][] = [];
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn((col: string, val: unknown) => {
    filters.push([col, val]);
    return chain;
  });
  chain.maybeSingle = vi.fn(async () => ({
    data: row && filters.every(([col, val]) => row[col] === val) ? row : null,
    error: null,
  }));
  return chain;
}

/**
 * La ligne canonique : appartient au site, VISIBLE et ACHETABLE.
 * `for_sale` y figure explicitement -- l'etat vendable n'est jamais implicite.
 */
const OWNED_ROW = {
  id: 'p1',
  site_id: 'site-1',
  cj_vid: 'v1',
  published: true,
  for_sale: true,
} as const;

function setupTables(opts: {
  site: unknown;
  cached: unknown;
  owned?: unknown;                        // passthrough historique (M1-06)
  product?: Record<string, unknown> | null; // ligne SOUMISE aux filtres
  recentCount?: number;                   // defaut : sous la borne
}) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'sites') return tableChain({ data: opts.site, error: null });
    if (table === 'shipping_cache') return tableChain({ data: opts.cached, error: null });
    if (table === 'shop_products') {
      // `owned` fourni explicitement -> comportement historique inchange.
      if (opts.owned !== undefined) return tableChain({ data: opts.owned, error: null });
      return filteringChain(opts.product === undefined ? { ...OWNED_ROW } : opts.product);
    }
    if (table === 'checkout_anomalies')
      return tableChain({ data: null, error: null, count: opts.recentCount ?? 0 } as any);
    throw new Error('unexpected table: ' + table);
  });
}

/** Les tables reellement interrogees, dans l'ordre. */
function tablesTouched(): string[] {
  return fromMock.mock.calls.map((c) => c[0] as string);
}

const TIERS = [
  { tier: 'eco', name: 'Standard Line', cost: 4.2, days_min: 8, days_max: 15 },
  { tier: 'standard', name: 'Fast Line', cost: 6.5, days_min: 5, days_max: 9 },
  { tier: 'express', name: 'DHL', cost: 15.9, days_min: 2, days_max: 4 },
];

describe('POST /api/shipping-estimate — LOT K : coût brut jamais exposé', () => {
  it("chemin cache : aucun champ 'cost' dans les tiers renvoyés, 'logisticPrice' absent de la réponse", async () => {
    setupTables({ site: { id: 'site-1' }, cached: { tiers: TIERS } });
    const res = await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.source).toBe('cache');
    expect(json.logisticPrice).toBeUndefined();
    for (const t of json.tiers) {
      expect(t.cost).toBeUndefined();
    }
  });

  it('chemin cache : logisticAging (le seul champ réellement consommé par le frontend) reste correct', async () => {
    setupTables({ site: { id: 'site-1' }, cached: { tiers: TIERS } });
    const res = await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }));
    const json = await res.json();
    expect(json.logisticAging).toBe('5-9');
    expect(json.logisticName).toBe('Fast Line');
  });

  it("chemin live (fallback CJ) : aucun champ 'cost'/'logisticPrice' non plus", async () => {
    setupTables({ site: { id: 'site-1' }, cached: null });
    cjCalculateFreightMock.mockResolvedValue([
      { logisticName: 'Fast Line', logisticPrice: 6.5, logisticAging: '5-9' },
      { logisticName: 'DHL', logisticPrice: 15.9, logisticAging: '2-4' },
    ]);
    const res = await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.source).toBe('live');
    expect(json.logisticPrice).toBeUndefined();
    for (const t of json.tiers) {
      expect(t.cost).toBeUndefined();
    }
  });

  it('les autres champs des tiers (tier, name, days_min, days_max) restent intacts -- aucune régression fonctionnelle', async () => {
    setupTables({ site: { id: 'site-1' }, cached: { tiers: TIERS } });
    const res = await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }));
    const json = await res.json();
    expect(json.tiers).toEqual([
      { tier: 'eco', name: 'Standard Line', days_min: 8, days_max: 15 },
      { tier: 'standard', name: 'Fast Line', days_min: 5, days_max: 9 },
      { tier: 'express', name: 'DHL', days_min: 2, days_max: 4 },
    ]);
  });
});

describe('POST /api/shipping-estimate — validation d\'entrée', () => {
  it('siteId manquant -> 400', async () => {
    const res = await POST(req({ countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }));
    expect(res.status).toBe(400);
  });

  it('site introuvable -> 404', async () => {
    setupTables({ site: null, cached: null });
    const res = await POST(req({ siteId: 'unknown', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }));
    expect(res.status).toBe(404);
  });
});

// ============================================================
// M1-06 -- le `vid` doit appartenir au site, et le debit est borne.
//
// Avant correctif : `siteId` etait verifie EXISTANT, le `vid` etait pris tel
// quel dans le corps de requete. Sur une route PUBLIQUE et NON AUTHENTIFIEE,
// `cjCalculateFreight` passe par `acquireCjSlot()` -- file globale partagee
// avec la creation des commandes fournisseur.
// ============================================================

describe('M1-06 — le vid doit appartenir au site', () => {
  it('vid ÉTRANGER au site -> 403, aucun appel CJ, aucune lecture de cache', async () => {
    setupTables({ site: { id: 'site-1' }, cached: { tiers: TIERS }, owned: null });
    const res = await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'vid-d-un-autre', quantity: 1 }] }));
    expect(res.status).toBe(403);
    expect(cjCalculateFreightMock).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.tiers).toBeUndefined();              // aucune donnee inter-locataire
  });

  it('vid appartenant au site -> servi normalement', async () => {
    setupTables({ site: { id: 'site-1' }, cached: { tiers: TIERS } });
    const res = await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }));
    expect(res.status).toBe(200);
    expect((await res.json()).source).toBe('cache');
  });

  it('vid absent -> 400 avant toute requête', async () => {
    setupTables({ site: { id: 'site-1' }, cached: null });
    const res = await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ quantity: 1 }] }));
    expect(res.status).toBe(400);
    expect(cjCalculateFreightMock).not.toHaveBeenCalled();
  });
});

describe('M1-06 — borne de débit sur la file CJ partagée', () => {
  it('sous la borne -> servi', async () => {
    setupTables({ site: { id: 'site-1' }, cached: { tiers: TIERS }, recentCount: 29 });
    expect((await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }))).status).toBe(200);
  });

  it('borne atteinte -> 429, AUCUN appel CJ (la file du fulfillment est protégée)', async () => {
    setupTables({ site: { id: 'site-1' }, cached: null, recentCount: 30 });
    const res = await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }));
    expect(res.status).toBe(429);
    expect(cjCalculateFreightMock).not.toHaveBeenCalled();
  });
});

describe('M1-06 — seul le vid vérifié part chez CJ', () => {
  it('les entrées supplémentaires du corps de requête sont ignorées', async () => {
    setupTables({ site: { id: 'site-1' }, cached: null });
    cjCalculateFreightMock.mockResolvedValue([
      { logisticName: 'Fast Line', logisticPrice: 6.5, logisticAging: '5-9' },
    ]);
    await POST(req({
      siteId: 'site-1', countryCode: 'US',
      products: [{ vid: 'v1', quantity: 1 }, { vid: 'vid-injecte', quantity: 999 }],
    }));
    expect(cjCalculateFreightMock).toHaveBeenCalledWith(
      'test@example.com', 'test-key', 'US', [{ vid: 'v1', quantity: 1 }]
    );
  });
});

// ============================================================
// DETTE 6b -- `published` NE SUFFIT PLUS : IL FAUT AUSSI `for_sale`.
//
// L'etape 8A a separe VISIBILITE (`published`) et ACHETABILITE (`for_sale`).
// Le checkout exige la conjonction ; cette route s'etait arretee au premier
// terme. Un produit `published = true, for_sale = false` obtenait donc un
// devis complet -- et, sur le chemin live, consommait un slot de la file CJ
// PARTAGEE avec la creation des commandes fournisseur.
//
// CONTRAT VERROUILLE ICI : le refus reste le 403 existant (aucun code ni
// message nouveau), il intervient AVANT le compteur et AVANT tout appel CJ,
// et il n'est PAS journalise -- un produit non achetable est un etat
// commercial normal, pas une anomalie.
// ============================================================

describe('DETTE 6b — un produit non achetable n’obtient aucun devis', () => {
  it('published = true, for_sale = FALSE -> 403 (fusionne avec le refus existant, aucun code nouveau)', async () => {
    setupTables({
      site: { id: 'site-1' },
      cached: { tiers: TIERS },
      product: { ...OWNED_ROW, for_sale: false },
    });
    const res = await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Product not available for this site');   // message INCHANGE
    expect(json.tiers).toBeUndefined();
  });

  it('for_sale = FALSE, chemin live : cjCalculateFreight n’est PAS appele — la file CJ du fulfillment est protegee', async () => {
    setupTables({
      site: { id: 'site-1' },
      cached: null,                                   // force le repli live
      product: { ...OWNED_ROW, for_sale: false },
    });
    cjCalculateFreightMock.mockResolvedValue([
      { logisticName: 'Fast Line', logisticPrice: 6.5, logisticAging: '5-9' },
    ]);
    const res = await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }));
    expect(res.status).toBe(403);
    expect(cjCalculateFreightMock).not.toHaveBeenCalled();
    expect(tablesTouched()).not.toContain('shipping_cache');          // meme le cache n'est pas lu
  });

  it('published = true, for_sale = true -> 200 (cas nominal intact)', async () => {
    setupTables({ site: { id: 'site-1' }, cached: { tiers: TIERS } });
    const res = await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.source).toBe('cache');
    expect(json.logisticAging).toBe('5-9');
  });

  it('published = FALSE (quel que soit for_sale) -> 403 : la garde de visibilite reste entiere', async () => {
    setupTables({
      site: { id: 'site-1' },
      cached: { tiers: TIERS },
      product: { ...OWNED_ROW, published: false },     // for_sale reste true
    });
    const res = await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }));
    expect(res.status).toBe(403);
  });

  it('la fixture porte `for_sale` explicitement — l’etat vendable n’est jamais implicite', () => {
    expect(OWNED_ROW).toHaveProperty('for_sale', true);
    expect(OWNED_ROW).toHaveProperty('published', true);
  });

  it('cj_vid ETRANGER -> 403 meme si le produit est publie ET vendable : l’appartenance reste une garde independante', async () => {
    setupTables({
      site: { id: 'site-1' },
      cached: { tiers: TIERS },
      product: { ...OWNED_ROW, cj_vid: 'vid-du-voisin' },
    });
    const res = await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }));
    expect(res.status).toBe(403);
    expect(cjCalculateFreightMock).not.toHaveBeenCalled();
  });

  it('un refus 403 ne journalise RIEN et ne consomme pas la borne de debit', async () => {
    setupTables({
      site: { id: 'site-1' },
      cached: { tiers: TIERS },
      product: { ...OWNED_ROW, for_sale: false },
    });
    const res = await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }));
    expect(res.status).toBe(403);
    expect(logAnomalyMock).not.toHaveBeenCalled();
    expect(tablesTouched()).not.toContain('checkout_anomalies');
  });

  it('un produit vendable journalise toujours son compteur — la journalisation existante n’a pas bouge', async () => {
    setupTables({ site: { id: 'site-1' }, cached: { tiers: TIERS } });
    await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }));
    expect(logAnomalyMock).toHaveBeenCalledTimes(1);
    expect(logAnomalyMock.mock.calls[0][0]).toMatchObject({
      type: 'shipping_estimate_request',
      severity: 'info',
    });
  });

  it('LOT K non touche : sur les chemins servis, aucun `cost` ne sort — cache ET live', async () => {
    setupTables({ site: { id: 'site-1' }, cached: { tiers: TIERS } });
    const cacheJson = await (await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }))).json();
    for (const t of cacheJson.tiers) expect(t.cost).toBeUndefined();
    expect(cacheJson.logisticPrice).toBeUndefined();

    setupTables({ site: { id: 'site-1' }, cached: null });
    cjCalculateFreightMock.mockResolvedValue([
      { logisticName: 'Fast Line', logisticPrice: 6.5, logisticAging: '5-9' },
      { logisticName: 'DHL', logisticPrice: 15.9, logisticAging: '2-4' },
    ]);
    const liveJson = await (await POST(req({ siteId: 'site-1', countryCode: 'US', products: [{ vid: 'v1', quantity: 1 }] }))).json();
    expect(liveJson.source).toBe('live');
    for (const t of liveJson.tiers) expect(t.cost).toBeUndefined();
    expect(liveJson.logisticPrice).toBeUndefined();
  });
});
