import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================
// Chantier Site Web / Mode 1 — verrouille l'extension de domain-retry aux
// paiements encaissés jamais provisionnés (status='paid' resté bloqué, ex.
// fonction interrompue avant que provisionDomain n'ait pu écrire un statut
// plus avancé). Avant ce correctif, seul status='failed' était repris :
// un domaine dans cet état intermédiaire précis n'était jamais retraité par
// aucun cron.
// ============================================================

const startCronRunMock = vi.fn();
const finishCronRunMock = vi.fn();
vi.mock('@/lib/cron-tracker', () => ({
  startCronRun: (...args: unknown[]) => startCronRunMock(...args),
  finishCronRun: (...args: unknown[]) => finishCronRunMock(...args),
}));

const provisionDomainMock = vi.fn();
vi.mock('@/lib/domains/provision', () => ({
  provisionDomain: (...args: unknown[]) => provisionDomainMock(...args),
}));

function makeSupabaseMock(rows: any[]) {
  const orCalls: string[] = [];
  const builder: any = {};
  ['select', 'lt', 'order', 'limit', 'eq'].forEach((m) => {
    builder[m] = (...args: unknown[]) => builder;
  });
  builder.or = (expr: string) => {
    orCalls.push(expr);
    return builder;
  };
  builder.update = () => builder;
  builder.then = (resolve: any) => resolve({ data: rows, error: null });
  const from = vi.fn(() => builder);
  return { supabaseAdmin: { from }, orCalls };
}

let currentMock: ReturnType<typeof makeSupabaseMock>;
vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() {
    return currentMock.supabaseAdmin;
  },
}));

function makeRequest() {
  return new NextRequest('https://woorri.test/api/cron/domain-retry', {
    headers: { authorization: 'Bearer test-secret' },
  });
}

beforeEach(() => {
  startCronRunMock.mockReset().mockResolvedValue('run-1');
  finishCronRunMock.mockReset().mockResolvedValue(undefined);
  provisionDomainMock.mockReset().mockResolvedValue({ ok: true, status: 'dns_configured' });
  process.env.CRON_SECRET = 'test-secret';
});

describe('GET /api/cron/domain-retry — reprise des paiements bloqués', () => {
  it('interroge à la fois les domaines en échec ET les paiements encaissés restés bloqués', async () => {
    currentMock = makeSupabaseMock([]);

    const { GET } = await import('../route');
    await GET(makeRequest());

    expect(currentMock.orCalls.length).toBe(1);
    expect(currentMock.orCalls[0]).toContain('status.eq.failed');
    expect(currentMock.orCalls[0]).toContain('status.eq.paid');
    expect(currentMock.orCalls[0]).toMatch(/updated_at\.lt\./);
  });

  // Audit Mode 3/POD BRAND, perfectionnement (fermeture dette Porkbun/DEBT-019) --
  // 'purchase_uncertain' est desormais REPRIS par ce cron (changement
  // deliberer par rapport au lot precedent, qui l'excluait totalement).
  // Ce n'est plus un risque de rachat a l'aveugle : provisionDomain()
  // reconcilie cet etat via listAllDomains() (verite Porkbun reelle) avant
  // toute action, avec son propre delai de securite interne (30 min,
  // largement couvert par l'intervalle de ce cron, 2h) -- voir
  // src/lib/domains/provision.ts et ses tests dedies pour la preuve que la
  // reconciliation elle-meme ne retente jamais purchaseDomain() a l'aveugle.
  it("cible desormais aussi 'purchase_uncertain' (reconciliation Porkbun sure, plus un dead-end manuel)", async () => {
    currentMock = makeSupabaseMock([]);

    const { GET } = await import('../route');
    await GET(makeRequest());

    expect(currentMock.orCalls[0]).toContain('status.eq.purchase_uncertain');
    expect(currentMock.orCalls.length).toBe(1); // une seule requête .or() au total
  });

  it('reprend réellement une ligne "paid" retournée par la requête (provisionDomain rappelé, idempotent)', async () => {
    currentMock = makeSupabaseMock([{ id: 'dom-stuck', domain: 'coince-paid.com', provision_attempts: 0 }]);

    const { GET } = await import('../route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(provisionDomainMock).toHaveBeenCalledWith('dom-stuck');
    expect(body.results[0]).toMatchObject({ domain: 'coince-paid.com', ok: true });
  });
});
