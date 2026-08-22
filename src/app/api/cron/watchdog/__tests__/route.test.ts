import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================
// Chantier Site Web / Mode 1 — verrouille l'observabilité des crons de la
// chaîne domaine/Google, motivée par deux trous réels trouvés lors de
// l'audit :
// 1. domain-indexing-byod n'était surveillé par rien (ajouté suite au
//    déclencheur explicite de ce tour).
// 2. La détection "cron manquant" (EXPECTED_CRONS) vérifie seulement qu'UNE
//    ligne existe dans la fenêtre, peu importe son status — un cron qui
//    tourne à l'heure mais échoue systématiquement (ex. clé de service
//    Google expirée) n'était jamais détecté. Nouvelle détection dédiée.
// ============================================================

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: vi.fn().mockResolvedValue(undefined) } })),
}));

const startCronRunMock = vi.fn();
const finishCronRunMock = vi.fn();
vi.mock('@/lib/cron-tracker', () => ({
  startCronRun: (...args: unknown[]) => startCronRunMock(...args),
  finishCronRun: (...args: unknown[]) => finishCronRunMock(...args),
}));

vi.mock('@/app/api/cron/domain-retry/route', () => ({ MAX_ATTEMPTS: 5 }));

type MockConfig = {
  cronRunsByName?: Record<string, { status: string }[]>;
  siteDomainsByStatus?: Record<string, unknown[]>;
  sitesRows?: unknown[];
};

function makeSupabaseMock({ cronRunsByName = {}, siteDomainsByStatus = {}, sitesRows = [] }: MockConfig) {
  const from = vi.fn((table: string) => {
    if (table === 'cron_runs') {
      let cronName = '';
      const b: any = {};
      b.select = () => b;
      b.eq = (col: string, val: string) => {
        if (col === 'cron_name') cronName = val;
        return b;
      };
      b.gte = () => b;
      b.order = () => b;
      b.limit = () => b;
      b.then = (resolve: any) => resolve({ data: cronRunsByName[cronName] || [], error: null });
      return b;
    }
    if (table === 'site_domains') {
      let status = '';
      const b: any = {};
      b.select = () => b;
      b.eq = (col: string, val: string) => {
        if (col === 'status') status = val;
        return b;
      };
      b.gte = () => b;
      b.then = (resolve: any) => resolve({ data: siteDomainsByStatus[status] || [], error: null });
      return b;
    }
    // 'sites' (échecs Google BYOD)
    const b: any = {};
    b.select = () => b;
    b.eq = () => b;
    b.then = (resolve: any) => resolve({ data: sitesRows, error: null });
    return b;
  });
  return { supabaseAdmin: { from } };
}

let currentMock: ReturnType<typeof makeSupabaseMock>;
vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() {
    return currentMock.supabaseAdmin;
  },
}));

function makeRequest() {
  return new NextRequest('https://woorri.test/api/cron/watchdog', {
    headers: { authorization: 'Bearer test-secret' },
  });
}

// Toutes les entrées EXPECTED_CRONS présentes par défaut, pour isoler
// chaque test sur le comportement qu'il vérifie réellement.
const ALL_PRESENT = { status: 'success' };
function baseCronRuns() {
  return {
    'catalog-sync': [ALL_PRESENT],
    'supplier-watch': [ALL_PRESENT],
    'domain-indexing': [ALL_PRESENT],
    'cj-tracking': [ALL_PRESENT],
    'instant-payout': [ALL_PRESENT],
    'catalog-suggest': [ALL_PRESENT],
    'domain-retry': [ALL_PRESENT],
    'domain-indexing-byod': [ALL_PRESENT],
  };
}

beforeEach(() => {
  startCronRunMock.mockReset().mockResolvedValue('run-1');
  finishCronRunMock.mockReset().mockResolvedValue(undefined);
  process.env.CRON_SECRET = 'test-secret';
  process.env.RESEND_API_KEY = 'test-key';
});

describe('GET /api/cron/watchdog — surveillance de domain-indexing-byod', () => {
  it('détecte domain-indexing-byod comme manquant s\'il n\'a jamais tourné dans sa fenêtre', async () => {
    const runs = baseCronRuns();
    runs['domain-indexing-byod'] = [];
    currentMock = makeSupabaseMock({ cronRunsByName: runs });

    const { GET } = await import('../route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.missing).toContain('domain-indexing-byod');
  });

  it('ne signale rien pour domain-indexing-byod quand il tourne normalement', async () => {
    currentMock = makeSupabaseMock({ cronRunsByName: baseCronRuns() });

    const { GET } = await import('../route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.missing).not.toContain('domain-indexing-byod');
  });
});

describe('GET /api/cron/watchdog — échec systématique (cron présent mais toujours en erreur)', () => {
  it('alerte quand les 3 dernières exécutions d\'un cron de la chaîne domaine sont toutes en erreur', async () => {
    const runs = baseCronRuns();
    runs['domain-indexing'] = [{ status: 'error' }, { status: 'error' }, { status: 'error' }];
    currentMock = makeSupabaseMock({ cronRunsByName: runs });

    const { GET } = await import('../route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.failingCrons).toContain('domain-indexing');
  });

  it('n\'alerte PAS si un succès est intercalé parmi les dernières exécutions', async () => {
    const runs = baseCronRuns();
    runs['domain-retry'] = [{ status: 'error' }, { status: 'success' }, { status: 'error' }];
    currentMock = makeSupabaseMock({ cronRunsByName: runs });

    const { GET } = await import('../route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.failingCrons).not.toContain('domain-retry');
  });

  it('n\'alerte PAS avec seulement 2 échecs (fenêtre incomplète)', async () => {
    const runs = baseCronRuns();
    runs['domain-indexing-byod'] = [{ status: 'error' }, { status: 'error' }];
    currentMock = makeSupabaseMock({ cronRunsByName: runs });

    const { GET } = await import('../route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.failingCrons).not.toContain('domain-indexing-byod');
  });
});

describe('GET /api/cron/watchdog — domaines en achat incertain (audit Mode 3/POD BRAND, perfectionnement, lot 2)', () => {
  // Categorie distincte de 'failed' : provisionDomain() bascule desormais
  // explicitement vers 'purchase_uncertain' quand l'achat Porkbun a reussi
  // mais que purchased_at n'a pas pu etre ecrit (voir src/lib/domains/provision.ts).
  // domain-retry ne reprend JAMAIS cette ligne automatiquement -- watchdog
  // est donc le SEUL mecanisme qui la rend visible, d'ou une alerte
  // immediate (pas de seuil de tentatives) verrouillee ici.
  it("détecte et compte les domaines status='purchase_uncertain', distinctement de 'failed'", async () => {
    currentMock = makeSupabaseMock({
      cronRunsByName: baseCronRuns(),
      siteDomainsByStatus: {
        purchase_uncertain: [{ id: 'd1', domain: 'incertain.com', site_id: 's1', last_error: 'ecriture DB en echec', updated_at: '2026-01-01' }],
      },
    });

    const { GET } = await import('../route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.purchaseUncertainDomains).toBe(1);
    expect(body.failedDomains).toBe(0);
  });

  it("n'alerte pas quand aucun domaine n'est en achat incertain", async () => {
    currentMock = makeSupabaseMock({ cronRunsByName: baseCronRuns() });

    const { GET } = await import('../route');
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.purchaseUncertainDomains).toBe(0);
    expect(body.ok).toBe(true);
  });
});

describe('GET /api/cron/watchdog — auto-observabilité', () => {
  it('enregistre sa propre exécution via startCronRun/finishCronRun, comme tous les autres crons', async () => {
    currentMock = makeSupabaseMock({ cronRunsByName: baseCronRuns() });

    const { GET } = await import('../route');
    await GET(makeRequest());

    expect(startCronRunMock).toHaveBeenCalledWith('watchdog');
    expect(finishCronRunMock).toHaveBeenCalledTimes(1);
  });
});
