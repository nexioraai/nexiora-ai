import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Audit Mode 3/POD BRAND, perfectionnement -- unicite atomique du domaine.
// Route BYOD (bring-your-own-domain, sites.custom_domain) : cible les deux
// garde-fous ajoutes par cet audit, symetriques a ceux de
// domains/purchase/route.ts (voir son fichier de test).
// 1. site_domains (achat Porkbun, pending/paid/purchased) n'etait jamais
//    consulte avant un rattachement BYOD -- un domaine deja reserve via
//    Porkbun pouvait etre revendique en BYOD par un autre site.
// 2. Le check-then-set final (UPDATE sites.custom_domain) reste non
//    transactionnel : la course residuelle (23505 sur la contrainte UNIQUE
//    partielle) doit se traduire par un 409 clair, pas un 500.
// Aucune couverture n'existait pour cette route avant ce lot.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

const addDomainToVercelMock = vi.fn();
vi.mock('@/lib/domains/vercel', () => ({
  addDomainToVercel: (...a: unknown[]) => addDomainToVercelMock(...a),
}));

function tableChain(response: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.neq = vi.fn(self);
  chain.update = vi.fn(self);
  chain.maybeSingle = vi.fn(async () => response);
  chain.then = (resolve: (v: unknown) => void) => resolve(response);
  return chain;
}

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { POST } from '../route';

function req(body: unknown): any {
  return new Request('https://deribfy.test/api/domains', {
    method: 'POST',
    headers: { authorization: 'Bearer good-token' },
    body: JSON.stringify(body),
  });
}

const SITE = { id: 'site-1', owner_email: 'owner@test.com', custom_domain: null };

beforeEach(() => {
  fromMock.mockReset();
  getUserMock.mockReset();
  addDomainToVercelMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'owner@test.com' } }, error: null });
  addDomainToVercelMock.mockResolvedValue({ verification: [] });
});

describe('POST /api/domains — site_domains (achat Porkbun) et sites.custom_domain (BYOD) ne se recoupaient jamais', () => {
  it('domaine deja reserve via Porkbun (site_domains, status pending) -> 409, jamais rattache en BYOD', async () => {
    let sitesCall = 0;
    const sitesChain = tableChain({ data: null, error: null });
    (sitesChain.maybeSingle as any).mockImplementation(async () => {
      sitesCall++;
      // 1er appel : ownership (site trouvé). 2e appel : conflit custom_domain (aucun).
      return sitesCall === 1 ? { data: SITE, error: null } : { data: null, error: null };
    });
    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') return sitesChain;
      if (table === 'site_domains') {
        return tableChain({ data: { id: 'dom-1', status: 'pending' }, error: null });
      }
      return tableChain({ data: null, error: null });
    });

    const res = await POST(req({ slug: 'boutique', domain: 'reserve.com' }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/deja reserve/i);
    expect(addDomainToVercelMock).not.toHaveBeenCalled();
  });

  it("site_domains en status 'failed' pour ce domaine -> pas un conflit, le rattachement BYOD continue normalement", async () => {
    let sitesCall = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') {
        sitesCall++;
        // 1er appel : ownership. 2e appel : conflit custom_domain (aucun). 3e : l'UPDATE final.
        return tableChain(sitesCall === 1 ? { data: SITE, error: null } : { data: null, error: null });
      }
      if (table === 'site_domains') {
        return tableChain({ data: { id: 'dom-2', status: 'failed' }, error: null });
      }
      return tableChain({ data: null, error: null });
    });

    const res = await POST(req({ slug: 'boutique', domain: 'libre-apres-echec.com' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(addDomainToVercelMock).toHaveBeenCalledWith('libre-apres-echec.com');
  });
});

describe('POST /api/domains — course residuelle sur sites.custom_domain (23505)', () => {
  it("l'UPDATE final echoue avec le code UNIQUE (23505) -> 409 clair, pas 500", async () => {
    let sitesCall = 0;
    const sitesChain = tableChain({ data: null, error: null });
    (sitesChain.maybeSingle as any).mockImplementation(async () => {
      sitesCall++;
      return sitesCall === 1 ? { data: SITE, error: null } : { data: null, error: null }; // ownership puis pas-de-conflit
    });
    // L'UPDATE final se resout via .then() (pas .maybeSingle()) dans la route.
    (sitesChain as any).then = (resolve: (v: unknown) => void) =>
      resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });

    fromMock.mockImplementation((table: string) => {
      if (table === 'sites') return sitesChain;
      if (table === 'site_domains') return tableChain({ data: null, error: null });
      return tableChain({ data: null, error: null });
    });

    const res = await POST(req({ slug: 'boutique', domain: 'course-byod.com' }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/deja utilise/i);
  });
});
