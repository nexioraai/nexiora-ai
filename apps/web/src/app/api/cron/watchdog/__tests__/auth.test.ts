import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Lot crons fail-open : verrouille isolément la garde d'authentification.
// Mocke '@/app/api/cron/domain-retry/route' (dependance croisee reelle :
// watchdog importe MAX_ATTEMPTS depuis domain-retry) exactement comme le
// fait deja route.test.ts -- evite de charger transitivement les
// dependances de domain-retry (domains/provision) pour ce test isole.
vi.mock('@/app/api/cron/domain-retry/route', () => ({ MAX_ATTEMPTS: 5 }));
vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send: vi.fn() } })) }));
vi.mock('@/lib/cron-tracker', () => ({
  startCronRun: vi.fn().mockResolvedValue('run-1'),
  finishCronRun: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const c: any = {};
      const self = () => c;
      c.select = self; c.eq = self; c.gte = self; c.order = self; c.limit = self;
      c.then = (resolve: any) => resolve({ data: [], error: null });
      return c;
    }),
  },
}));

import { GET } from '../route';

function req(token?: string) {
  return new Request('https://x.test/api/cron/watchdog', {
    headers: token ? { authorization: 'Bearer ' + token } : {},
  }) as any;
}

describe('GET /api/cron/watchdog — authentification (fail-closed)', () => {
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
