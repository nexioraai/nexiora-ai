import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Audit Mode 3/POD BRAND, perfectionnement -- unicite atomique du domaine.
// Cible precisement les deux garde-fous ajoutes par cet audit :
// 1. sites.custom_domain (BYOD) et site_domains (achat Porkbun) ne se
//    recoupaient jamais -- un domaine deja rattache en BYOD pouvait etre
//    "reserve" une seconde fois via l'achat payant.
// 2. Le SELECT-puis-INSERT sur site_domains (etape 2) reste non
//    transactionnel : la course residuelle (deux achats concurrents pour
//    le meme domaine) doit se traduire par un 409 clair (23505), pas un
//    500 opaque, une fois la contrainte UNIQUE reelle en place (voir
//    supabase/sql/domains_unique_constraints.sql).
// Aucune autre couverture n'existait pour cette route avant ce lot.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const getStripeMock = vi.fn();
vi.mock('@/lib/stripe', () => ({
  getStripe: (...a: unknown[]) => getStripeMock(...a),
}));

const checkDomainMock = vi.fn();
const getRegistrationRequirementsMock = vi.fn();
vi.mock('@/lib/domains/porkbun', () => ({
  checkDomain: (...a: unknown[]) => checkDomainMock(...a),
  getRegistrationRequirements: (...a: unknown[]) => getRegistrationRequirementsMock(...a),
  NEXIORA_DOMAIN_MARGIN_USD: 8,
}));

type Handlers = Record<string, { data: unknown; error?: unknown }>;

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.insert = vi.fn(self);
  chain.update = vi.fn(self);
  chain.single = vi.fn(async () => response);
  chain.maybeSingle = vi.fn(async () => response);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { POST } from '../route';

function setupTables(handlers: Handlers, fallback: { data: unknown; error?: unknown } = { data: null, error: null }) {
  const chains = new Map<string, ReturnType<typeof tableChain>>();
  fromMock.mockImplementation((table: string) => {
    if (!chains.has(table)) chains.set(table, tableChain(handlers[table] ?? fallback));
    return chains.get(table)!;
  });
  return chains;
}

function req(body: unknown): any {
  return new Request('https://deribfy.test/api/domains/purchase', {
    method: 'POST',
    headers: { authorization: 'Bearer good-token' },
    body: JSON.stringify(body),
  });
}

const SITE = { id: 'site-1', owner_email: 'owner@test.com', name: 'Boutique' };

beforeEach(() => {
  fromMock.mockReset();
  getUserMock.mockReset();
  getStripeMock.mockReset();
  checkDomainMock.mockReset();
  getRegistrationRequirementsMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'owner@test.com' } }, error: null });
});

describe('POST /api/domains/purchase — sites.custom_domain (BYOD) et site_domains ne se recoupaient jamais', () => {
  it('domaine deja rattache en BYOD a un site (sites.custom_domain) -> 409, avant tout appel Porkbun/Stripe', async () => {
    // `sites` est interrogée deux fois par la route (ownership, puis conflit
    // BYOD par custom_domain) -- même table, réponses différentes -> compteur
    // d'appels plutôt qu'une réponse statique unique.
    let call = 0;
    const sitesChain = tableChain({ data: null, error: null });
    (sitesChain.maybeSingle as any).mockImplementation(async () => {
      call++;
      return call === 1 ? { data: SITE, error: null } : { data: { id: 'other-site-id' }, error: null };
    });
    fromMock.mockImplementation((table: string) => (table === 'sites' ? sitesChain : tableChain({ data: null, error: null })));

    const res = await POST(req({ slug: 'boutique', domain: 'exemple.com' }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/deja utilise/i);
    expect(checkDomainMock).not.toHaveBeenCalled();
    expect(getStripeMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/domains/purchase — course residuelle sur la reservation (23505)', () => {
  it("l'INSERT site_domains echoue avec le code UNIQUE (23505) -> 409 clair, pas 500, aucun appel Stripe apres", async () => {
    let sitesCall = 0;
    const sitesChain = tableChain({ data: null, error: null });
    (sitesChain.maybeSingle as any).mockImplementation(async () => {
      sitesCall++;
      // 1er appel : ownership (site trouvé) ; 2e appel : conflit BYOD (aucun).
      return sitesCall === 1 ? { data: SITE, error: null } : { data: null, error: null };
    });

    const siteDomainsChain = tableChain({ data: null, error: null });
    // SELECT anti-doublon (étape 2, fast-path) : ne voit rien -> laisse
    // passer jusqu'à l'INSERT, qui échoue réellement sur la contrainte.
    (siteDomainsChain.maybeSingle as any).mockResolvedValue({ data: null, error: null });
    (siteDomainsChain.single as any).mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') return sitesChain;
      if (table === 'site_domains') return siteDomainsChain;
      return tableChain({ data: null, error: null });
    });

    getRegistrationRequirementsMock.mockResolvedValue({ apiRegisterable: true });
    checkDomainMock.mockResolvedValue({
      available: true, registrationCents: 1000, sellRenewalUsd: 15, sellFirstYearUsd: 10, firstYearPromo: false,
    });

    const res = await POST(req({ slug: 'boutique', domain: 'course.com' }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/deja reserve/i);
    expect(getStripeMock).not.toHaveBeenCalled();
  });
});
