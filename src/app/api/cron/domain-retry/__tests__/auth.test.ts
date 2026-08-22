import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Lot crons fail-open : verrouille isolément la garde d'authentification --
// séparé du fichier de tests comportementaux existant (route.test.ts).
// Sensibilité particulière de ce cron (documentée dans route.ts) : il
// déclenche provisionDomain(), des effets réels Porkbun/Vercel -- la garde
// d'authentification est donc la seule protection contre un déclenchement
// non autorisé consommant du quota API réel.

vi.mock('@/lib/cron-tracker', () => ({
  startCronRun: vi.fn().mockResolvedValue('run-1'),
  finishCronRun: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/domains/provision', () => ({ provisionDomain: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const c: any = {};
      const self = () => c;
      c.select = self; c.or = self; c.lt = self; c.order = self; c.limit = self;
      c.then = (resolve: any) => resolve({ data: [], error: null });
      return c;
    }),
  },
}));

import { GET } from '../route';

function req(token?: string) {
  return new Request('https://x.test/api/cron/domain-retry', {
    headers: token ? { authorization: 'Bearer ' + token } : {},
  }) as any;
}

describe('GET /api/cron/domain-retry — authentification (fail-closed)', () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET;
  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_SECRET;
  });

  it('CRON_SECRET absent -> 401 (fail-closed, pas fail-open) -- particulierement important : evite un declenchement non autorise de provisionDomain()', async () => {
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
