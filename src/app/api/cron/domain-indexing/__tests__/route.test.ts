import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================
// Chantier Site Web / Mode 1 — verrouille l'état terminal 'google_failed'
// introduit pour combler un vrai trou : avant ce correctif, un domaine dont
// la vérification Google échouait indéfiniment sortait silencieusement du
// filtre `gsc_attempts < MAX_ATTEMPTS` sans jamais produire d'état
// exploitable ni d'alerte (le watchdog ne surveillait que status='failed',
// jamais atteint par ce chemin).
// ============================================================

const startCronRunMock = vi.fn();
const finishCronRunMock = vi.fn();
vi.mock('@/lib/cron-tracker', () => ({
  startCronRun: (...args: unknown[]) => startCronRunMock(...args),
  finishCronRun: (...args: unknown[]) => finishCronRunMock(...args),
}));

const verifyDomainMock = vi.fn();
const addSiteMock = vi.fn();
const submitSitemapMock = vi.fn();
vi.mock('@/lib/domains/searchconsole', () => ({
  verifyDomain: (...args: unknown[]) => verifyDomainMock(...args),
  addSite: (...args: unknown[]) => addSiteMock(...args),
  submitSitemap: (...args: unknown[]) => submitSitemapMock(...args),
}));

function makeSupabaseMock(rows: any[]) {
  const updateCalls: any[] = [];
  const builder: any = {};
  ['select', 'in', 'lt', 'or', 'limit', 'eq'].forEach((m) => {
    builder[m] = (...args: unknown[]) => builder;
  });
  builder.update = (payload: unknown) => {
    updateCalls.push(payload);
    return builder;
  };
  builder.then = (resolve: any) => resolve({ data: rows, error: null });
  const from = vi.fn(() => builder);
  return { supabaseAdmin: { from }, updateCalls };
}

let currentMock: ReturnType<typeof makeSupabaseMock>;
vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() {
    return currentMock.supabaseAdmin;
  },
}));

function makeRequest() {
  return new NextRequest('https://woorri.test/api/cron/domain-indexing', {
    headers: { authorization: 'Bearer test-secret' },
  });
}

beforeEach(() => {
  startCronRunMock.mockReset().mockResolvedValue('run-1');
  finishCronRunMock.mockReset().mockResolvedValue(undefined);
  verifyDomainMock.mockReset();
  addSiteMock.mockReset();
  submitSitemapMock.mockReset();
  process.env.CRON_SECRET = 'test-secret';
});

describe('GET /api/cron/domain-indexing — état terminal google_failed', () => {
  it('marque google_failed quand la vérification échoue à la dernière tentative autorisée (MAX_ATTEMPTS=20)', async () => {
    currentMock = makeSupabaseMock([
      { id: 'dom-1', domain: 'bloque.com', status: 'dns_configured', gsc_token: 'tok', gsc_attempts: 19, gsc_last_attempt_at: null },
    ]);
    verifyDomainMock.mockResolvedValue(false);

    const { GET } = await import('../route');
    await GET(makeRequest());

    const terminal = currentMock.updateCalls.find((u) => u.status === 'google_failed');
    expect(terminal).toBeDefined();
    expect(terminal.last_error).toMatch(/20 tentatives/);
  });

  it('ne marque PAS google_failed avant MAX_ATTEMPTS — reste retentable', async () => {
    currentMock = makeSupabaseMock([
      { id: 'dom-2', domain: 'en-cours.com', status: 'dns_configured', gsc_token: 'tok', gsc_attempts: 5, gsc_last_attempt_at: null },
    ]);
    verifyDomainMock.mockResolvedValue(false);

    const { GET } = await import('../route');
    await GET(makeRequest());

    const terminal = currentMock.updateCalls.find((u) => u.status === 'google_failed');
    expect(terminal).toBeUndefined();
  });

  it('ne marque pas google_failed si la vérification finit par réussir, même à la dernière tentative', async () => {
    currentMock = makeSupabaseMock([
      { id: 'dom-3', domain: 'juste-a-temps.com', status: 'dns_configured', gsc_token: 'tok', gsc_attempts: 19, gsc_last_attempt_at: null },
    ]);
    verifyDomainMock.mockResolvedValue(true);
    addSiteMock.mockResolvedValue(undefined);
    submitSitemapMock.mockResolvedValue(undefined);

    const { GET } = await import('../route');
    await GET(makeRequest());

    const terminal = currentMock.updateCalls.find((u) => u.status === 'google_failed');
    expect(terminal).toBeUndefined();
    const submitted = currentMock.updateCalls.find((u) => u.status === 'sitemap_submitted');
    expect(submitted).toBeDefined();
  });
});
