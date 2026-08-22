import { describe, it, expect, vi, beforeEach } from 'vitest';

// LOT I (F-I-2) -- test minimal et ciblé sur le seul correctif appliqué ici
// (fail-open CRON_SECRET, même cause racine que instant-payout/route.ts) --
// cette route est hors périmètre logique de LOT I (utilitaire de contenu,
// pas fournisseurs/financier/webhooks), donc aucune couverture élargie du
// comportement métier n'est ajoutée ici (disproportionné pour un correctif
// d'authentification isolé, non demandé par ce lot).

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('@/lib/pexels', () => ({ getPhotos: vi.fn() }));

import { GET } from '../route';

function req(authHeader?: string | null) {
  const headers: Record<string, string> = {};
  if (authHeader !== null && authHeader !== undefined) headers.authorization = authHeader;
  return new Request('https://woorri.test/api/backfill-hero', { headers }) as any;
}

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret';
});

describe('GET /api/backfill-hero — authentification (LOT I, F-I-2, fail-closed)', () => {
  it('CRON_SECRET absent -> 401, même sans en-tête fourni', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("REGRESSION CIBLÉE : CRON_SECRET absent + en-tête littéral 'Bearer undefined' -> 401", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req('Bearer undefined'));
    expect(res.status).toBe(401);
  });

  it('en-tête absent -> 401', async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
  });

  it('secret incorrect -> 401', async () => {
    const res = await GET(req('Bearer wrong'));
    expect(res.status).toBe(401);
  });
});
