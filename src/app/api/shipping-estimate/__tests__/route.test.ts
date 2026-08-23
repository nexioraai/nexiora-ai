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
  process.env.CJ_EMAIL = 'test@example.com';
  process.env.CJ_API_KEY = 'test-key';
});

// M1-06 : la route verifie desormais que le `vid` appartient au site
// (`shop_products`) et compte les appels recents (`checkout_anomalies`).
// Ces deux tables sont donc ajoutees au harnais -- fixture, pas assertion :
// aucun test existant ne change de sens.
function setupTables(opts: {
  site: unknown;
  cached: unknown;
  owned?: unknown;        // defaut : le vid appartient bien au site
  recentCount?: number;   // defaut : sous la borne
}) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'sites') return tableChain({ data: opts.site, error: null });
    if (table === 'shipping_cache') return tableChain({ data: opts.cached, error: null });
    if (table === 'shop_products')
      return tableChain({ data: opts.owned === undefined ? { id: 'p1' } : opts.owned, error: null });
    if (table === 'checkout_anomalies')
      return tableChain({ data: null, error: null, count: opts.recentCount ?? 0 } as any);
    throw new Error('unexpected table: ' + table);
  });
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
