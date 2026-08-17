import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Chantier Site Web / Mode 1 — verrouille provisionDomain() avant le
// premier test reel avec achat Porkbun. Cible precisement les deux bugs
// trouves et corriges lors de l'audit :
// 1. Le token Google etait regenere sans condition a CHAQUE appel de
//    provisionDomain() (donc a chaque renouvellement Stripe annuel),
//    accumulant des TXT obsoletes dans la zone DNS.
// 2. Le garde en tete de fonction ('indexed' || 'dns_configured') traitait
//    un statut INTERMEDIAIRE comme "deja termine", bloquant toute reprise
//    manuelle d'un domaine reste coince a cette etape apres un echec
//    transitoire du TXT Google.
// ============================================================

const purchaseDomainMock = vi.fn();
const previewPurchaseMock = vi.fn();
const createDnsRecordMock = vi.fn();
const deleteDnsByNameTypeMock = vi.fn();
vi.mock('@/lib/domains/porkbun', () => ({
  purchaseDomain: (...args: unknown[]) => purchaseDomainMock(...args),
  previewPurchase: (...args: unknown[]) => previewPurchaseMock(...args),
  createDnsRecord: (...args: unknown[]) => createDnsRecordMock(...args),
  deleteDnsByNameType: (...args: unknown[]) => deleteDnsByNameTypeMock(...args),
}));

const addDomainToVercelMock = vi.fn();
const getVercelDomainStatusMock = vi.fn();
const verifyVercelDomainMock = vi.fn();
vi.mock('@/lib/domains/vercel', () => ({
  addDomainToVercel: (...args: unknown[]) => addDomainToVercelMock(...args),
  getVercelDomainStatus: (...args: unknown[]) => getVercelDomainStatusMock(...args),
  verifyVercelDomain: (...args: unknown[]) => verifyVercelDomainMock(...args),
  VERCEL_A_RECORD: '76.76.21.21',
  VERCEL_CNAME: 'cname.vercel-dns.com',
}));

const getDnsVerificationTokenMock = vi.fn();
vi.mock('@/lib/domains/searchconsole', () => ({
  getDnsVerificationToken: (...args: unknown[]) => getDnsVerificationTokenMock(...args),
}));

const checkExistingMailMock = vi.fn();
vi.mock('@/lib/domains/mail-guard', () => ({
  checkExistingMail: (...args: unknown[]) => checkExistingMailMock(...args),
}));

// Mock supabaseAdmin minimal mais fidele : chaque methode de chaine renvoie
// le builder lui-meme (comme le vrai client), la resolution se fait via
// .then() sur une file de reponses fournie par le test, dans l'ordre exact
// des appels .from(...) attendus. Fragile a l'ordre par construction, mais
// le code testé suit un chemin deterministe pour un etat donne.
function makeSupabaseMock(responses: any[]) {
  let i = 0;
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const builder: any = {};
  const chain = (method: string) => (...args: unknown[]) => {
    calls.push({ table: calls.length ? calls[calls.length - 1].table : '?', method, args });
    return builder;
  };
  ['select', 'update', 'eq', 'in', 'or', 'lt', 'is', 'limit', 'order', 'maybeSingle'].forEach((m) => {
    builder[m] = chain(m);
  });
  builder.then = (resolve: any) => {
    const r = responses[i] ?? { data: null, error: null };
    i++;
    resolve(r);
  };
  const from = vi.fn((table: string) => {
    calls.push({ table, method: 'from', args: [table] });
    return builder;
  });
  return { supabaseAdmin: { from }, calls };
}

let currentMock: ReturnType<typeof makeSupabaseMock>;
vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() {
    return currentMock.supabaseAdmin;
  },
}));

let provisionDomain: typeof import('../provision').provisionDomain;

beforeEach(async () => {
  vi.resetModules();
  purchaseDomainMock.mockReset();
  previewPurchaseMock.mockReset();
  createDnsRecordMock.mockReset();
  deleteDnsByNameTypeMock.mockReset();
  addDomainToVercelMock.mockReset();
  getVercelDomainStatusMock.mockReset();
  verifyVercelDomainMock.mockReset();
  getDnsVerificationTokenMock.mockReset();
  checkExistingMailMock.mockReset();

  addDomainToVercelMock.mockResolvedValue({ ok: true, alreadyExists: true, verification: [], dns: [] });
  getVercelDomainStatusMock.mockResolvedValue({ attached: true, verified: true, verification: [] });
  verifyVercelDomainMock.mockResolvedValue(true);
  checkExistingMailMock.mockResolvedValue({ hasMail: false, safe: true, hosts: [] });
  deleteDnsByNameTypeMock.mockResolvedValue(undefined);

  ({ provisionDomain } = await import('../provision'));
});

describe('provisionDomain — token Google au renouvellement (bug corrigé)', () => {
  it('ne régénère jamais un token Google déjà présent (renouvellement annuel)', async () => {
    currentMock = makeSupabaseMock([
      // SELECT initial de la ligne : deja entierement provisionnee, y compris gsc_token.
      {
        data: {
          id: 'dom-1', domain: 'exemple.com', price_cents: 1500, status: 'sitemap_submitted',
          purchased_at: '2025-01-01T00:00:00Z', dns_configured_at: '2025-01-01T01:00:00Z',
          site_id: 'site-1', gsc_token: 'deja-existant-abc123',
        },
      },
      // Etape 5 : sites.update({ custom_domain })
      { data: null, error: null },
    ]);

    const result = await provisionDomain('dom-1');

    expect(getDnsVerificationTokenMock).not.toHaveBeenCalled();
    expect(createDnsRecordMock).not.toHaveBeenCalledWith('exemple.com', expect.objectContaining({ type: 'TXT', name: '' }));
    expect(result.ok).toBe(true);
  });

  it('génère le token une seule fois quand aucun token n\'existe encore', async () => {
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-2', domain: 'nouveau.com', price_cents: 1500, status: 'dns_configured',
          purchased_at: '2026-08-01T00:00:00Z', dns_configured_at: '2026-08-01T01:00:00Z',
          site_id: 'site-2', gsc_token: null,
        },
      },
      { data: null, error: null }, // update gsc_token
      { data: null, error: null }, // update sites.custom_domain
    ]);
    getDnsVerificationTokenMock.mockResolvedValue('nouveau-token-xyz');

    await provisionDomain('dom-2');

    expect(getDnsVerificationTokenMock).toHaveBeenCalledTimes(1);
    expect(createDnsRecordMock).toHaveBeenCalledWith('nouveau.com', { type: 'TXT', name: '', content: 'nouveau-token-xyz' });
  });
});

describe('provisionDomain — idempotence de l\'achat', () => {
  it('n\'appelle jamais purchaseDomain si purchased_at est déjà renseigné', async () => {
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-3', domain: 'deja-achete.com', price_cents: 1500, status: 'dns_configured',
          purchased_at: '2026-08-01T00:00:00Z', dns_configured_at: '2026-08-01T01:00:00Z',
          site_id: 'site-3', gsc_token: 'tok',
        },
      },
      { data: null, error: null },
    ]);

    await provisionDomain('dom-3');

    expect(purchaseDomainMock).not.toHaveBeenCalled();
    expect(previewPurchaseMock).not.toHaveBeenCalled();
  });

  it('achète avec l\'id de la ligne site_domains comme clé d\'idempotence Porkbun', async () => {
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-4', domain: 'frais.com', price_cents: 2000, status: 'pending',
          purchased_at: null, dns_configured_at: null, site_id: 'site-4', gsc_token: null,
        },
      },
      { data: null, error: null }, // update status: purchased
      { data: null, error: null }, // update dns_configured
      { data: null, error: null }, // update gsc_token
      { data: null, error: null }, // update sites.custom_domain
    ]);
    previewPurchaseMock.mockResolvedValue({ wouldSucceed: true });
    purchaseDomainMock.mockResolvedValue({ ok: true, raw: {} });
    getDnsVerificationTokenMock.mockResolvedValue('tok-frais');

    await provisionDomain('dom-4');

    expect(purchaseDomainMock).toHaveBeenCalledWith('frais.com', 2000, 'dom-4');
  });

  it('échoue proprement (status failed) si le prix a dérivé, sans jamais appeler purchaseDomain', async () => {
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-5', domain: 'prix-perime.com', price_cents: 1000, status: 'pending',
          purchased_at: null, dns_configured_at: null, site_id: 'site-5', gsc_token: null,
        },
      },
      { data: null, error: null }, // update status: failed
    ]);
    previewPurchaseMock.mockResolvedValue({ wouldSucceed: false, message: 'Prix différent' });

    const result = await provisionDomain('dom-5');

    expect(purchaseDomainMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.status).toBe('failed');
  });
});

describe('provisionDomain — état terminal et reprise (garde en tête de fonction corrigée)', () => {
  it('sitemap_submitted : retour immédiat, aucun appel externe', async () => {
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-6', domain: 'termine.com', price_cents: 1500, status: 'sitemap_submitted',
          purchased_at: '2025-01-01T00:00:00Z', dns_configured_at: '2025-01-01T01:00:00Z',
          site_id: 'site-6', gsc_token: 'tok',
        },
      },
    ]);

    const result = await provisionDomain('dom-6');

    expect(result).toEqual({ ok: true, status: 'sitemap_submitted' });
    expect(addDomainToVercelMock).not.toHaveBeenCalled();
    expect(checkExistingMailMock).not.toHaveBeenCalled();
  });

  it('dns_configured (état intermédiaire) : la fonction retente réellement au lieu de court-circuiter', async () => {
    // Avant le correctif, 'dns_configured' était traité comme "déjà fait" et
    // la fonction retournait avant même d'essayer de régénérer le TXT Google
    // manquant — un domaine resté coincé ici après un échec transitoire ne
    // pouvait plus jamais être repris, y compris manuellement.
    currentMock = makeSupabaseMock([
      {
        data: {
          id: 'dom-7', domain: 'coince.com', price_cents: 1500, status: 'dns_configured',
          purchased_at: '2026-08-01T00:00:00Z', dns_configured_at: '2026-08-01T01:00:00Z',
          site_id: 'site-7', gsc_token: null,
        },
      },
      { data: null, error: null }, // update gsc_token
      { data: null, error: null }, // update sites.custom_domain
    ]);
    getDnsVerificationTokenMock.mockResolvedValue('recovery-token');

    await provisionDomain('dom-7');

    expect(getDnsVerificationTokenMock).toHaveBeenCalledTimes(1);
  });
});
