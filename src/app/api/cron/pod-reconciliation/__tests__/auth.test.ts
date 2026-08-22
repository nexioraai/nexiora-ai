import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Audit fulfillment (cablage vercel.json) : pod-reconciliation reprenait le
// pattern fail-open (`CRON_SECRET &&`) deja identifie sur 11 autres crons --
// corrige en fail-closed explicite au moment de son activation reelle, ce
// cron modifiant desormais un moteur qui touche des commandes payees.
// Ce test isole uniquement la garde d'authentification (pas la logique de
// reconciliation elle-meme, qui depend des tables fulfillment).

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const chain: any = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      chain.lt = vi.fn(() => chain);
      chain.limit = vi.fn(async () => ({ data: [], error: null }));
      return chain;
    }),
  },
}));
vi.mock('@/lib/cron-tracker', () => ({
  startCronRun: vi.fn().mockResolvedValue('run-1'),
  finishCronRun: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/fulfillment/submission-service', () => ({
  claimSubmissionAttempt: vi.fn(),
  transitionSubmissionStatus: vi.fn(),
  recoverStaleProcessingSubmissions: vi.fn().mockResolvedValue({ recovered: 0, candidates: 0 }),
}));
vi.mock('@/lib/fulfillment/provider-order-service', () => ({ upsertProviderOrder: vi.fn() }));
vi.mock('@/lib/fulfillment/provider-lookup', () => ({
  lookupPrintfulOrderByExternalId: vi.fn(),
  lookupGelatoOrderByReferenceId: vi.fn(),
}));
vi.mock('@/lib/fulfillment/observability', () => ({ reportReconciliationConflict: vi.fn() }));

import { GET } from '../route';

function req(token?: string) {
  return new NextRequestLike(token) as any;
}
class NextRequestLike {
  headers: Headers;
  constructor(token?: string) {
    this.headers = new Headers(token ? { authorization: `Bearer ${token}` } : {});
  }
}

describe('GET /api/cron/pod-reconciliation -- authentification', () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET;
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_SECRET;
  });

  it('CRON_SECRET absent -> 401, fail-closed (defaut corrige, pas fail-open)', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req('peu-importe') as any);
    expect(res.status).toBe(401);
  });

  it('CRON_SECRET absent et aucun header -> 401', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req() as any);
    expect(res.status).toBe(401);
  });

  it('CRON_SECRET present mais mauvais token -> 401', async () => {
    process.env.CRON_SECRET = 'le-vrai-secret';
    const res = await GET(req('mauvais-token') as any);
    expect(res.status).toBe(401);
  });

  it('CRON_SECRET present et bon token -> passe l\'authentification (200 ou traitement reel, pas 401)', async () => {
    process.env.CRON_SECRET = 'le-vrai-secret';
    const res = await GET(req('le-vrai-secret') as any);
    expect(res.status).not.toBe(401);
  });
});
