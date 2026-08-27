import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Clôture Mode 3 (audit cj-tracking) : verrouille isolément la garde
// d'authentification fail-closed (le pattern fail-open `CRON_SECRET && ...`
// déjà identifié et corrigé sur 12+ crons cette session) -- séparé des
// tests de logique de tracking pour ne pas mélanger les deux garanties.

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const c: any = {};
      const self = () => c;
      c.select = self; c.not = self; c.is = self; c.neq = self; c.eq = self;
      c.limit = async () => ({ data: [], error: null });
      return c;
    }),
  },
}));
vi.mock('@/lib/cron-tracker', () => ({
  startCronRun: vi.fn().mockResolvedValue('run-1'),
  finishCronRun: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/cj/client', () => ({ cjGetOrderDetail: vi.fn() }));
vi.mock('@/lib/email/sendShippingEmail', () => ({ sendShippingEmail: vi.fn() }));

import { GET } from '../route';

function req(token?: string) {
  return new Request('https://x.test/api/cron/cj-tracking', {
    headers: token ? { authorization: 'Bearer ' + token } : {},
  }) as any;
}

describe('GET /api/cron/cj-tracking — authentification (fail-closed)', () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET;
  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_SECRET;
  });

  it('CRON_SECRET absent -> 401 (fail-closed, pas fail-open)', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req('peu-importe'));
    expect(res.status).toBe(401);
  });

  it('CRON_SECRET absent et aucun header -> 401', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('CRON_SECRET present mais mauvais token -> 401', async () => {
    process.env.CRON_SECRET = 'le-vrai-secret';
    const res = await GET(req('mauvais-token'));
    expect(res.status).toBe(401);
  });

  it('CRON_SECRET present et bon token -> passe l\'authentification (200, pas 401)', async () => {
    process.env.CRON_SECRET = 'le-vrai-secret';
    const res = await GET(req('le-vrai-secret'));
    expect(res.status).not.toBe(401);
  });
});
