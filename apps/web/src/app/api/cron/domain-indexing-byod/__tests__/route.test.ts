import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================
// Chantier Site Web / Mode 1 — verrouille les trois garanties les plus
// critiques du cron BYOD, chacune motivée par un défaut réel trouvé lors de
// l'audit :
// 1. Un marchand qui n'a pas fini son DNS externe ne doit JAMAIS être compté
//    dans custom_domain_google_attempts (sinon un marchand simplement lent
//    déclenche une fausse alerte "échec" au bout de MAX_ATTEMPTS, alors que
//    rien n'est cassé côté Nexiora).
// 2. Un domaine déjà géré par le pipeline achat (présent dans site_domains
//    pour SA paire site_id+domain) ne doit jamais être traité ici.
// 3. Après épuisement réel des tentatives côté Google, un état terminal
//    explicite doit être écrit.
// ============================================================

const startCronRunMock = vi.fn();
const finishCronRunMock = vi.fn();
vi.mock('@/lib/cron-tracker', () => ({
  startCronRun: (...args: unknown[]) => startCronRunMock(...args),
  finishCronRun: (...args: unknown[]) => finishCronRunMock(...args),
}));

const getVercelDomainStatusMock = vi.fn();
vi.mock('@/lib/domains/vercel', () => ({
  getVercelDomainStatus: (...args: unknown[]) => getVercelDomainStatusMock(...args),
}));

const getDnsVerificationTokenMock = vi.fn();
const verifyDomainMock = vi.fn();
const addSiteMock = vi.fn();
const submitSitemapMock = vi.fn();
vi.mock('@/lib/domains/searchconsole', () => ({
  getDnsVerificationToken: (...args: unknown[]) => getDnsVerificationTokenMock(...args),
  verifyDomain: (...args: unknown[]) => verifyDomainMock(...args),
  addSite: (...args: unknown[]) => addSiteMock(...args),
  submitSitemap: (...args: unknown[]) => submitSitemapMock(...args),
}));

// 'sites' renvoie les candidats puis encaisse les updates ; 'site_domains'
// renvoie la liste des domaines déjà gérés par le pipeline achat (pour le
// test de séparation).
function makeSupabaseMock(sitesRows: any[], purchasedRows: any[] = []) {
  const updateCalls: { table: string; payload: any }[] = [];
  function builderFor(table: string, resolveData: any) {
    const b: any = {};
    ['select', 'not', 'eq', 'or', 'limit', 'in', 'is'].forEach((m) => {
      b[m] = (...args: unknown[]) => b;
    });
    b.update = (payload: unknown) => {
      updateCalls.push({ table, payload });
      return b;
    };
    b.then = (resolve: any) => resolve({ data: resolveData, error: null });
    return b;
  }
  const from = vi.fn((table: string) => {
    if (table === 'site_domains') return builderFor('site_domains', purchasedRows);
    return builderFor('sites', sitesRows);
  });
  return { supabaseAdmin: { from }, updateCalls };
}

let currentMock: ReturnType<typeof makeSupabaseMock>;
vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() {
    return currentMock.supabaseAdmin;
  },
}));

function makeRequest() {
  return new NextRequest('https://woorri.test/api/cron/domain-indexing-byod', {
    headers: { authorization: 'Bearer test-secret' },
  });
}

beforeEach(() => {
  startCronRunMock.mockReset().mockResolvedValue('run-1');
  finishCronRunMock.mockReset().mockResolvedValue(undefined);
  getVercelDomainStatusMock.mockReset();
  getDnsVerificationTokenMock.mockReset();
  verifyDomainMock.mockReset();
  addSiteMock.mockReset();
  submitSitemapMock.mockReset();
  process.env.CRON_SECRET = 'test-secret';
});

describe('GET /api/cron/domain-indexing-byod — comptage des tentatives', () => {
  it('un marchand qui n\'a pas encore fini son DNS externe (Vercel non vérifié) ne compte pas dans custom_domain_google_attempts', async () => {
    const { MAX_ATTEMPTS } = await import('../route');
    currentMock = makeSupabaseMock([
      { id: 'site-1', custom_domain: 'marchand-lent.com', custom_domain_google_status: null, custom_domain_google_token: null, custom_domain_google_attempts: MAX_ATTEMPTS - 1 },
    ]);
    getVercelDomainStatusMock.mockResolvedValue({ attached: true, verified: false, verification: [] });

    const { GET } = await import('../route');
    await GET(makeRequest());

    const attemptsUpdate = currentMock.updateCalls.find((u) => u.table === 'sites' && 'custom_domain_google_attempts' in u.payload);
    expect(attemptsUpdate).toBeUndefined();
    const failedUpdate = currentMock.updateCalls.find((u) => u.payload.custom_domain_google_status === 'failed');
    expect(failedUpdate).toBeUndefined();
  });

  it('une fois Vercel vérifié, les tentatives sont comptées et un état terminal apparaît à MAX_ATTEMPTS', async () => {
    const { MAX_ATTEMPTS } = await import('../route');
    currentMock = makeSupabaseMock([
      { id: 'site-2', custom_domain: 'stuck.com', custom_domain_google_status: 'token_issued', custom_domain_google_token: 'tok', custom_domain_google_attempts: MAX_ATTEMPTS - 1 },
    ]);
    getVercelDomainStatusMock.mockResolvedValue({ attached: true, verified: true, verification: [] });
    verifyDomainMock.mockResolvedValue(false);

    const { GET } = await import('../route');
    await GET(makeRequest());

    const attemptsUpdate = currentMock.updateCalls.find((u) => u.table === 'sites' && u.payload.custom_domain_google_attempts === MAX_ATTEMPTS);
    expect(attemptsUpdate).toBeDefined();
    const failedUpdate = currentMock.updateCalls.find((u) => u.payload.custom_domain_google_status === 'failed');
    expect(failedUpdate).toBeDefined();
  });
});

describe('GET /api/cron/domain-indexing-byod — séparation avec le pipeline achat', () => {
  it('exclut un site dont le domaine actuel est déjà géré par site_domains (même site_id ET même domain)', async () => {
    currentMock = makeSupabaseMock(
      [{ id: 'site-3', custom_domain: 'achete.com', custom_domain_google_status: null, custom_domain_google_token: null, custom_domain_google_attempts: null }],
      [{ site_id: 'site-3', domain: 'achete.com' }]
    );
    getVercelDomainStatusMock.mockResolvedValue({ attached: true, verified: true, verification: [] });

    const { GET } = await import('../route');
    await GET(makeRequest());

    expect(getVercelDomainStatusMock).not.toHaveBeenCalled();
  });

  it('ne traite pas un site dont une ancienne ligne site_domains porte un AUTRE domaine (pas d\'exclusion par site_id seul)', async () => {
    currentMock = makeSupabaseMock(
      [{ id: 'site-4', custom_domain: 'nouveau-byod.com', custom_domain_google_status: null, custom_domain_google_token: null, custom_domain_google_attempts: null }],
      [{ site_id: 'site-4', domain: 'ancien-domaine-abandonne.com' }]
    );
    getVercelDomainStatusMock.mockResolvedValue({ attached: true, verified: true, verification: [] });
    getDnsVerificationTokenMock.mockResolvedValue('tok-byod');

    const { GET } = await import('../route');
    await GET(makeRequest());

    expect(getVercelDomainStatusMock).toHaveBeenCalledWith('nouveau-byod.com');
  });
});
