import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================
// DETTE 6a, EXTENSION -- LES QUATRE ROUTES `domains/*`.
//
// Elles ne portaient pas `.eq('owner_email', ...)` mais la comparaison
// equivalente en JavaScript :
//
//     if (!site || site.owner_email !== user.email) return 403
//
// Idiome different, MEME cle, MEME defaut -- c'est ce qui l'avait fait
// echapper au premier balayage de la dette 6a. `sites.owner_email` est ecrite
// une seule fois, a la creation du site, et aucun update ne la touche jamais :
// un proprietaire qui change d'adresse laisse la colonne figee, et quiconque
// obtient ensuite cette adresse devenait proprietaire aux yeux de ces routes.
//
// CE QU'ELLES FONT REELLEMENT : rattacher un domaine (Vercel), en acheter un
// (Stripe + Porkbun), en provisionner un (DNS, Vercel, Google), ou lire l'etat
// complet d'un domaine. Aucune n'est anodine.
//
// Le harnais APPLIQUE les filtres : la ligne n'est rendue que si tous les
// `.eq()` l'apparient. Une fixture permissive laisserait passer le retour de
// `owner_email` comme cle d'identite.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

type Row = Record<string, unknown>;
let sitesRows: Row[] = [];
let siteDomainsRow: Row | null = null;

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

// --- operations reelles, toutes mockees : aucune ne doit partir sur un refus
const addDomainToVercelMock = vi.fn();
const getVercelDomainStatusMock = vi.fn();
vi.mock('@/lib/domains/vercel', () => ({
  addDomainToVercel: (...a: unknown[]) => addDomainToVercelMock(...a),
  getVercelDomainStatus: (...a: unknown[]) => getVercelDomainStatusMock(...a),
}));

const listAllDomainsMock = vi.fn();
const getRegistrationRequirementsMock = vi.fn();
const checkDomainMock = vi.fn();
vi.mock('@/lib/domains/porkbun', () => ({
  listAllDomains: (...a: unknown[]) => listAllDomainsMock(...a),
  getRegistrationRequirements: (...a: unknown[]) => getRegistrationRequirementsMock(...a),
  checkDomain: (...a: unknown[]) => checkDomainMock(...a),
  NEXIORA_DOMAIN_MARGIN_USD: 5,
}));

const provisionDomainMock = vi.fn();
vi.mock('@/lib/domains/provision', () => ({
  provisionDomain: (...a: unknown[]) => provisionDomainMock(...a),
}));

const stripeCustomersListMock = vi.fn();
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    customers: { list: (...a: unknown[]) => stripeCustomersListMock(...a), create: vi.fn() },
    products: { create: vi.fn() },
    prices: { create: vi.fn() },
    subscriptions: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
  }),
}));

function tableChain(rows: () => Row[] | Row | null) {
  const filters: [string, unknown][] = [];
  const nots: [string, unknown][] = [];
  const b: any = {};
  b.select = () => b;
  b.eq = (c: string, v: unknown) => { filters.push([c, v]); return b; };
  b.neq = (c: string, v: unknown) => { nots.push([c, v]); return b; };
  b.order = () => b;
  b.limit = () => b;
  b.update = () => b;
  b.insert = () => b;
  b.upsert = () => b;
  const resolve = () => {
    const src = rows();
    if (src === null) return { data: null, error: null };
    if (!Array.isArray(src)) return { data: src, error: null };
    const hit = src.find(
      (r) => filters.every(([c, v]) => r[c] === v) && nots.every(([c, v]) => r[c] !== v)
    );
    return { data: hit ?? null, error: null };
  };
  b.maybeSingle = async () => resolve();
  b.single = async () => resolve();
  b.then = (res: (v: unknown) => void) => res(resolve());
  return b;
}

const USER = { id: 'user-1', email: 'merchant@example.com' };

function siteRow(over: Row = {}): Row {
  return {
    id: 'site-1', slug: 'ma-boutique',
    owner_id: USER.id, owner_email: USER.email,
    name: 'Ma Boutique', custom_domain: null,
    custom_domain_google_status: null, custom_domain_google_token: null,
    custom_domain_google_attempts: null, custom_domain_google_last_attempt_at: null,
    custom_domain_google_last_error: null,
    ...over,
  };
}

beforeEach(() => {
  sitesRows = [siteRow()];
  siteDomainsRow = null;
  getUserMock.mockReset().mockResolvedValue({ data: { user: { ...USER } }, error: null });
  addDomainToVercelMock.mockReset().mockResolvedValue({ verification: [] });
  getVercelDomainStatusMock.mockReset().mockResolvedValue({ attached: true, verified: true, verification: [] });
  listAllDomainsMock.mockReset().mockResolvedValue([{ domain: 'mondomaine.com' }]);
  getRegistrationRequirementsMock.mockReset().mockResolvedValue({ apiRegisterable: true });
  checkDomainMock.mockReset().mockResolvedValue({ available: true, price: 12 });
  provisionDomainMock.mockReset().mockResolvedValue({ ok: true });
  stripeCustomersListMock.mockReset().mockResolvedValue({ data: [] });
  process.env.CRON_SECRET = 'operator-secret';
  fromMock.mockReset().mockImplementation((table: string) => {
    if (table === 'sites') return tableChain(() => sitesRows);
    if (table === 'site_domains') return tableChain(() => siteDomainsRow);
    return tableChain(() => null);
  });
});

/** Les quatre routes, avec leur requête et l'opération réelle qu'un refus doit empêcher. */
const ROUTES = [
  {
    nom: 'domains (BYOD)',
    charger: () => import('../route'),
    verbe: 'POST' as const,
    requete: () => new Request('https://d.test/api/domains', {
      method: 'POST', headers: { authorization: 'Bearer t' },
      body: JSON.stringify({ slug: 'ma-boutique', domain: 'mondomaine.com' }),
    }),
    operation: () => addDomainToVercelMock,
  },
  {
    nom: 'domains/purchase',
    charger: () => import('../purchase/route'),
    verbe: 'POST' as const,
    requete: () => new Request('https://d.test/api/domains/purchase', {
      method: 'POST', headers: { authorization: 'Bearer t' },
      body: JSON.stringify({ slug: 'ma-boutique', domain: 'mondomaine.com' }),
    }),
    operation: () => getRegistrationRequirementsMock,
  },
  {
    nom: 'domains/status',
    charger: () => import('../status/route'),
    verbe: 'GET' as const,
    // `status` lit `req.nextUrl` : il lui faut une vraie NextRequest.
    requete: () => new NextRequest('https://d.test/api/domains/status?slug=ma-boutique', {
      headers: { authorization: 'Bearer t' },
    }),
    operation: () => getVercelDomainStatusMock,
    // `status` n'interroge Vercel que si le site porte deja un domaine BYOD :
    // sans cela, l'appel n'a pas lieu et ne prouverait rien.
    site: (over: Row = {}) => siteRow({ custom_domain: 'mondomaine.com', ...over }),
  },
  {
    nom: 'domains/provision',
    charger: () => import('../provision/route'),
    verbe: 'POST' as const,
    requete: () => new Request('https://d.test/api/domains/provision', {
      method: 'POST', headers: { authorization: 'Bearer t' },
      body: JSON.stringify({ slug: 'ma-boutique', domain: 'mondomaine.com' }),
    }),
    operation: () => listAllDomainsMock,
  },
];

/** Le site de reference de cette route (certaines exigent un etat de depart). */
function siteDe(r: (typeof ROUTES)[number], over: Row = {}): Row {
  const fab = (r as { site?: (o?: Row) => Row }).site;
  return fab ? fab(over) : siteRow(over);
}

async function appeler(r: (typeof ROUTES)[number]) {
  const mod = await r.charger();
  const handler = (mod as Record<string, any>)[r.verbe];
  return handler(r.requete() as any);
}

for (const r of ROUTES) {
  describe(`DETTE 6a — ${r.nom}`, () => {
    it('propriétaire légitime -> pas de refus, l’opération est atteinte', async () => {
      sitesRows = [siteDe(r)];
      const res = await appeler(r);
      expect([401, 403, 404]).not.toContain(res.status);
      expect(r.operation()).toHaveBeenCalled();
    });

    it('🔴 CAS DÉCISIF : owner_id DIFFÉRENT mais owner_email identique -> 403, aucune opération', async () => {
      sitesRows = [siteDe(r, { owner_id: 'quelquun-dautre', owner_email: USER.email })];
      const res = await appeler(r);
      expect(res.status).toBe(403);
      expect(r.operation()).not.toHaveBeenCalled();
    });

    it('owner_id CORRECT mais adresse changée -> accepté', async () => {
      sitesRows = [siteDe(r, { owner_id: USER.id, owner_email: 'ancienne@example.com' })];
      const res = await appeler(r);
      expect([401, 403, 404]).not.toContain(res.status);
    });

    it('owner_id NULL + adresse correspondante -> accepté (repli canonique)', async () => {
      sitesRows = [siteDe(r, { owner_id: null, owner_email: USER.email })];
      const res = await appeler(r);
      expect([401, 403, 404]).not.toContain(res.status);
    });

    it('owner_id NULL + adresse différente -> 403, aucune opération', async () => {
      sitesRows = [siteDe(r, { owner_id: null, owner_email: 'autre@example.com' })];
      const res = await appeler(r);
      expect(res.status).toBe(403);
      expect(r.operation()).not.toHaveBeenCalled();
    });

    it('non authentifié -> 401, aucune opération', async () => {
      getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
      const res = await appeler(r);
      expect(res.status).toBe(401);
      expect(r.operation()).not.toHaveBeenCalled();
    });

    it('site inexistant -> 404 (distinct du refus de propriété)', async () => {
      sitesRows = [];
      const res = await appeler(r);
      expect(res.status).toBe(404);
      expect(r.operation()).not.toHaveBeenCalled();
    });
  });
}

describe('DETTE 6a — domains/provision : la voie OPÉRATEUR est préservée', () => {
  function requeteOperateur() {
    return new Request('https://d.test/api/domains/provision', {
      method: 'POST',
      headers: { authorization: 'Bearer operator-secret' },
      body: JSON.stringify({ slug: 'ma-boutique', domain: 'mondomaine.com' }),
    });
  }

  it('CRON_SECRET passe sans contrôle de propriété — même sur un site d’autrui', async () => {
    sitesRows = [siteRow({ owner_id: 'quelquun-dautre', owner_email: 'autre@example.com' })];
    const { POST } = await import('../provision/route');
    const res = await POST(requeteOperateur() as any);

    expect([401, 403]).not.toContain(res.status);
    expect(listAllDomainsMock, 'la chaîne de provisioning est atteinte').toHaveBeenCalled();
    expect(getUserMock, 'aucune résolution d’utilisateur sur la voie opérateur').not.toHaveBeenCalled();
  });

  it('CRON_SECRET sur un site inexistant -> 404', async () => {
    sitesRows = [];
    const { POST } = await import('../provision/route');
    expect((await POST(requeteOperateur() as any)).status).toBe(404);
    expect(listAllDomainsMock).not.toHaveBeenCalled();
  });

  it('CRON_SECRET absent de l’environnement -> le jeton retombe sur la voie marchand', async () => {
    delete process.env.CRON_SECRET;
    // Le site appartient à quelqu'un d'autre : sans la voie opérateur, la
    // primitive doit refuser. C'est ce qui prouve que le raccourci n'existe
    // que lorsque le secret est réellement configuré.
    sitesRows = [siteRow({ owner_id: 'quelquun-dautre', owner_email: 'autre@example.com' })];
    const { POST } = await import('../provision/route');
    const res = await POST(requeteOperateur() as any);

    expect(getUserMock, 'le jeton est traité comme un jeton utilisateur').toHaveBeenCalled();
    expect(res.status).toBe(403);
    expect(listAllDomainsMock).not.toHaveBeenCalled();
  });
});
