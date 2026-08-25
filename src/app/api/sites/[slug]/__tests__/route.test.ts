import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// DETTE 6a, EXTENSION -- PREMIERE COUVERTURE DE CETTE ROUTE.
//
// Elle n'en avait AUCUNE, et son prefixe n'etait meme pas collecte par
// `vitest run` (corrige dans le meme lot, vitest.config.ts). C'est pourtant
// l'occurrence la plus grave de l'extension : un PATCH de 19 colonnes de
// contenu, execute en `service_role`, dont la SEULE garde de propriete etait
// une clause `.eq('owner_email', user.email)` PORTEE PAR L'UPDATE LUI-MEME.
//
// `sites.owner_email` est ecrite une seule fois, a la creation du site, et
// aucun update ne la touche jamais. Un proprietaire qui change d'adresse
// laisse la colonne figee : quiconque obtient ensuite cette adresse pouvait
// reecrire le site entier.
//
// LE HARNAIS APPLIQUE LES FILTRES. Une fixture qui rendrait la ligne quelle
// que soit la requete laisserait passer le retour de `owner_email` comme cle :
// l'auteur du test aurait DECIDE la reponse. Ici les lignes vivent dans
// `sitesRows` et ne sont rendues que si TOUS les filtres les apparient.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

type Row = Record<string, unknown>;
let sitesRows: Row[] = [];
let updates: Array<{ payload: Row; filters: [string, unknown][] }> = [];

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

function chain(table: string) {
  if (table !== 'sites') throw new Error('table inattendue : ' + table);
  const filters: [string, unknown][] = [];
  let payload: Row | null = null;
  const b: any = {};
  b.select = () => b;
  b.eq = (col: string, val: unknown) => { filters.push([col, val]); return b; };
  b.update = (p: Row) => { payload = p; return b; };
  const match = () => sitesRows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null;
  const settle = () => {
    if (payload) {
      const cible = match();
      updates.push({ payload, filters: [...filters] });
      if (!cible) return { data: null, error: null };
      Object.assign(cible, payload);
      return { data: cible, error: null };
    }
    return { data: match(), error: null };
  };
  b.single = async () => settle();
  b.maybeSingle = async () => settle();
  return b;
}

const USER = { id: 'user-1', email: 'merchant@example.com' };

function siteRow(over: Row = {}): Row {
  return {
    id: 'site-1', slug: 'ma-boutique',
    owner_id: USER.id, owner_email: USER.email,
    name: 'Ma Boutique', theme: 'editorial',
    ...over,
  };
}

function req(body: unknown, headers: Record<string, string> = { authorization: 'Bearer t' }) {
  return new Request('https://woorri.test/api/sites/ma-boutique', {
    method: 'PATCH', headers, body: JSON.stringify(body),
  });
}
const ctx = (slug = 'ma-boutique') => ({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  fromMock.mockReset().mockImplementation((t: string) => chain(t));
  sitesRows = [];
  updates = [];
  getUserMock.mockReset().mockResolvedValue({ data: { user: { ...USER } }, error: null });
});

describe('DETTE 6a — PATCH /api/sites/[slug] : propriété AVANT toute écriture', () => {
  it('propriétaire légitime -> 200, le champ est appliqué', async () => {
    sitesRows = [siteRow()];
    const { PATCH } = await import('../route');
    const res = await PATCH(req({ name: 'Nouveau nom' }), ctx());

    expect(res.status).toBe(200);
    expect(sitesRows[0].name).toBe('Nouveau nom');
  });

  it('🔴 CAS DÉCISIF : owner_id DIFFÉRENT mais owner_email identique -> 403, AUCUN UPDATE', async () => {
    sitesRows = [siteRow({ owner_id: 'quelquun-dautre', owner_email: USER.email })];
    const { PATCH } = await import('../route');
    const res = await PATCH(req({ name: 'Détourné' }), ctx());

    expect(res.status).toBe(403);
    expect(updates, 'aucune écriture ne doit avoir été tentée').toEqual([]);
    expect(sitesRows[0].name, 'le contenu est intact').toBe('Ma Boutique');
  });

  it('owner_id CORRECT mais adresse changée -> 200 (l’identité ne se périme pas)', async () => {
    sitesRows = [siteRow({ owner_id: USER.id, owner_email: 'ancienne@example.com' })];
    const { PATCH } = await import('../route');
    expect((await PATCH(req({ name: 'X' }), ctx())).status).toBe(200);
  });

  it('owner_id NULL + adresse correspondante -> 200 via le repli canonique', async () => {
    sitesRows = [siteRow({ owner_id: null, owner_email: USER.email })];
    const { PATCH } = await import('../route');
    expect((await PATCH(req({ name: 'X' }), ctx())).status).toBe(200);
  });

  it('owner_id NULL + adresse différente -> 403, aucun UPDATE', async () => {
    sitesRows = [siteRow({ owner_id: null, owner_email: 'autre@example.com' })];
    const { PATCH } = await import('../route');
    expect((await PATCH(req({ name: 'X' }), ctx())).status).toBe(403);
    expect(updates).toEqual([]);
  });

  it('non authentifié -> 401, aucun UPDATE', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    sitesRows = [siteRow()];
    const { PATCH } = await import('../route');
    expect((await PATCH(req({ name: 'X' }), ctx())).status).toBe(401);
    expect(updates).toEqual([]);
  });

  it('aucun en-tête d’autorisation -> 401', async () => {
    sitesRows = [siteRow()];
    const { PATCH } = await import('../route');
    expect((await PATCH(req({ name: 'X' }, {}), ctx())).status).toBe(401);
    expect(updates).toEqual([]);
  });

  it('site inexistant -> 404', async () => {
    sitesRows = [];
    const { PATCH } = await import('../route');
    expect((await PATCH(req({ name: 'X' }), ctx('inconnu'))).status).toBe(404);
  });
});

describe('DETTE 6a — l’UPDATE vise la ligne déjà autorisée', () => {
  it('ancré sur `id` SEUL : ni owner_email, ni owner_id, ni slug', async () => {
    sitesRows = [siteRow()];
    const { PATCH } = await import('../route');
    await PATCH(req({ name: 'X' }), ctx());

    expect(updates).toHaveLength(1);
    expect(updates[0].filters.map(([c]) => c)).toEqual(['id']);
    expect(updates[0].filters[0][1]).toBe('site-1');
  });

  it('aucun autre site n’est touché', async () => {
    sitesRows = [siteRow(), siteRow({ id: 'site-2', slug: 'voisin', name: 'Voisin' })];
    const { PATCH } = await import('../route');
    await PATCH(req({ name: 'Modifié' }), ctx());

    expect(sitesRows[0].name).toBe('Modifié');
    expect(sitesRows[1].name).toBe('Voisin');
  });
});

describe('DETTE 6a — le contrat du payload est inchangé', () => {
  it('payload sans aucun champ connu -> 400, et aucun UPDATE', async () => {
    sitesRows = [siteRow()];
    const { PATCH } = await import('../route');
    const res = await PATCH(req({ champInconnu: 'x' }), ctx());

    expect(res.status).toBe(400);
    expect(updates).toEqual([]);
  });

  it('les 19 champs de FIELD_MAP restent acceptés, et eux seuls', async () => {
    sitesRows = [siteRow()];
    const { PATCH } = await import('../route');
    await PATCH(
      req({
        name: 'n', slogan: 's', type: 't', primaryColor: '#111', heroTitle: 'ht',
        heroSubtitle: 'hs', about: 'a', services: [], testimonials: [], gallery: [],
        contact: {}, menu: [], team: [], hours: {}, address: 'ad', pages: [],
        cta: 'c', socialLinks: {}, theme: 'noir',
        // hors allowlist -- doivent être ignorés en silence
        owner_email: 'pirate@example.com', owner_id: 'pirate', published: true,
      }),
      ctx()
    );

    const p = updates[0].payload;
    expect(Object.keys(p).sort()).toEqual([
      'about', 'address', 'contact', 'cta', 'gallery', 'hero_subtitle', 'hero_title',
      'hours', 'menu', 'name', 'pages', 'primary_color', 'services', 'slogan',
      'social_links', 'team', 'testimonials', 'theme', 'type',
    ]);
    expect(Object.keys(p)).toHaveLength(19);
    expect(p).not.toHaveProperty('owner_email');
    expect(p).not.toHaveProperty('owner_id');
    expect(p).not.toHaveProperty('published');
  });
});
