import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// LOT K (Mode 3 global, F-CRON-01) -- première couverture de cette route
// (aucune avant ce lot). Verrouille le correctif prioritaire : cette route
// n'avait AUCUNE authentification -- n'importe qui pouvait la déclencher
// (appels CJ réels consommant le quota API partagé, écritures réelles sur
// catalog_products, email d'alerte admin).

const startCronRunMock = vi.fn();
const finishCronRunMock = vi.fn();
vi.mock('@/lib/cron-tracker', () => ({
  startCronRun: (...a: unknown[]) => startCronRunMock(...a),
  finishCronRun: (...a: unknown[]) => finishCronRunMock(...a),
}));

const cjFetchMock = vi.fn();
vi.mock('@/lib/cj/client', () => ({
  cjFetch: (...a: unknown[]) => cjFetchMock(...a),
}));

vi.mock('resend', () => ({
  Resend: function ResendMock(this: any) {
    this.emails = { send: vi.fn() };
  },
}));

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.in = vi.fn(self);
  chain.order = vi.fn(self);
  chain.limit = vi.fn(self);
  chain.update = vi.fn(self);
  chain.insert = vi.fn(async () => ({ error: null }));
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { GET } from '../route';

function req(authHeader?: string | null) {
  const headers: Record<string, string> = {};
  if (authHeader !== null && authHeader !== undefined) headers.authorization = authHeader;
  return new NextRequest('https://woorri.test/api/cron/supplier-watch', { headers });
}

beforeEach(() => {
  startCronRunMock.mockReset().mockResolvedValue('run-1');
  finishCronRunMock.mockReset().mockResolvedValue(undefined);
  cjFetchMock.mockReset();
  fromMock.mockReset();
  fromMock.mockReturnValue(tableChain({ data: [], error: null }));
  process.env.CRON_SECRET = 'test-secret';
  process.env.CJ_EMAIL = 'test@example.com';
  process.env.CJ_API_KEY = 'test-key';
});

describe('GET /api/cron/supplier-watch — LOT K (F-CRON-01) : authentification fail-closed', () => {
  it('CRON_SECRET absent -> 401, aucun appel CJ, aucune écriture DB', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req('Bearer whatever'));
    expect(res.status).toBe(401);
    expect(cjFetchMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
    expect(startCronRunMock).not.toHaveBeenCalled();
  });

  it("REGRESSION CIBLÉE : avant ce lot, cette route n'avait AUCUN contrôle du tout (le paramètre req n'était même pas lu) -- une requête sans en-tête authorization doit désormais être rejetée", async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
    expect(cjFetchMock).not.toHaveBeenCalled();
  });

  it('secret incorrect -> 401', async () => {
    const res = await GET(req('Bearer wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('secret correct -> le cron démarre réellement (startCronRun appelé)', async () => {
    const res = await GET(req('Bearer test-secret'));
    expect(res.status).toBe(200);
    expect(startCronRunMock).toHaveBeenCalledWith('supplier-watch');
  });
});

describe('GET /api/cron/supplier-watch — comportement métier (inchangé par LOT K)', () => {
  it("aucun produit vendu -> retour immédiat, aucun appel CJ", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'site_catalog_selections') return tableChain({ data: [], error: null });
      return tableChain({ data: [], error: null });
    });
    const res = await GET(req('Bearer test-secret'));
    const json = await res.json();
    expect(json.checked).toBe(0);
    expect(cjFetchMock).not.toHaveBeenCalled();
  });
});
