import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// DETTE 6a, EXTENSION -- PREMIERE COUVERTURE DE CETTE ROUTE.
//
// Aucun test, et un prefixe non collecte par `vitest run` (corrige dans le
// meme lot). La requete d'origine melait TROIS clauses dans un seul
// `maybeSingle` : le slug, `owner_email` (autorisation) et `published`
// (gating commercial) -- un seul `null` en sortie, un seul message pour trois
// causes. `owner_email` y tenait lieu d'identite alors que la colonne, ecrite
// une seule fois a la creation, ne bouge jamais.
//
// CE QUI EST VERIFIE ICI, ET DANS CET ORDRE :
//   1. la propriete, par la primitive canonique (401 / 404 / 403) ;
//   2. `published`, regle METIER avec son message metier propre ;
//   3. seulement ensuite, les fournisseurs externes.
// Un refus de propriete ne doit atteindre AUCUN LLM.
// ============================================================

const getUserMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => getUserMock(...a) } },
}));

type Row = Record<string, unknown>;
let sitesRows: Row[] = [];
let briefRow: Row | null = null;
let assetsInserted: Row[] = [];

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

const messagesCreateMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...a: unknown[]) => messagesCreateMock(...a) };
  },
}));
vi.mock('@/lib/ai-usage', () => ({ logAiUsage: vi.fn() }));

function sitesChain() {
  const filters: [string, unknown][] = [];
  const b: any = {};
  b.select = () => b;
  b.eq = (col: string, val: unknown) => { filters.push([col, val]); return b; };
  b.maybeSingle = async () => ({
    data: sitesRows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null,
    error: null,
  });
  b.single = b.maybeSingle;
  return b;
}

const USER = { id: 'user-1', email: 'merchant@example.com' };

function siteRow(over: Row = {}): Row {
  return {
    id: 'site-1', slug: 'ma-boutique',
    owner_id: USER.id, owner_email: USER.email,
    published: true, name: 'Ma Boutique', type: 'restaurant',
    primary_color: '#111', area_served: 'Montreal',
    ...over,
  };
}

function req(body: unknown = { slug: 'ma-boutique', format: 'email' }, headers: Record<string, string> = { authorization: 'Bearer t' }) {
  return new Request('https://woorri.test/api/marketing/generate', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  sitesRows = [siteRow()];
  briefRow = { brief: { ton: 'moderne', positionnement: 'premium' } };
  assetsInserted = [];
  getUserMock.mockReset().mockResolvedValue({ data: { user: { ...USER } }, error: null });
  messagesCreateMock.mockReset().mockResolvedValue({
    content: [{ type: 'text', text: '{"sujet":"Bonjour","corps":"Texte"}' }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  fromMock.mockReset().mockImplementation((table: string) => {
    if (table === 'sites') return sitesChain();
    if (table === 'marketing_briefs') {
      const b: any = {};
      b.select = () => b; b.eq = () => b;
      b.maybeSingle = async () => ({ data: briefRow, error: null });
      b.upsert = async () => ({ data: null, error: null });
      return b;
    }
    if (table === 'marketing_assets') {
      return { insert: async (r: Row) => { assetsInserted.push(r); return { data: null, error: null }; } };
    }
    throw new Error('table inattendue : ' + table);
  });
});

describe('DETTE 6a — propriété du site avant tout appel LLM', () => {
  it('propriétaire + site publié -> génération normale', async () => {
    const { POST } = await import('../route');
    const res = await POST(req());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.format).toBe('email');
    expect(messagesCreateMock).toHaveBeenCalled();
  });

  it('🔴 CAS DÉCISIF : owner_id DIFFÉRENT mais owner_email identique -> 403, AUCUN appel LLM', async () => {
    sitesRows = [siteRow({ owner_id: 'quelquun-dautre', owner_email: USER.email })];
    const { POST } = await import('../route');
    const res = await POST(req());

    expect(res.status).toBe(403);
    expect(messagesCreateMock).not.toHaveBeenCalled();
    expect(assetsInserted, 'aucune écriture non plus').toEqual([]);
  });

  it('owner_id CORRECT mais adresse changée -> accepté', async () => {
    sitesRows = [siteRow({ owner_id: USER.id, owner_email: 'ancienne@example.com' })];
    const { POST } = await import('../route');
    expect((await POST(req())).status).toBe(200);
  });

  it('owner_id NULL + adresse correspondante -> accepté (repli canonique)', async () => {
    sitesRows = [siteRow({ owner_id: null, owner_email: USER.email })];
    const { POST } = await import('../route');
    expect((await POST(req())).status).toBe(200);
  });

  it('owner_id NULL + adresse différente -> 403, aucun appel LLM', async () => {
    sitesRows = [siteRow({ owner_id: null, owner_email: 'autre@example.com' })];
    const { POST } = await import('../route');
    expect((await POST(req())).status).toBe(403);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('non authentifié -> 401, aucun appel LLM', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    const { POST } = await import('../route');
    expect((await POST(req())).status).toBe(401);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('site inexistant -> 404 (plus confondu avec « non publié »)', async () => {
    sitesRows = [];
    const { POST } = await import('../route');
    expect((await POST(req({ slug: 'inconnu', format: 'email' }))).status).toBe(404);
  });
});

describe('DETTE 6a — `published` reste une règle MÉTIER, séparée', () => {
  it('propriétaire mais site NON publié -> 403 avec le message métier d’origine', async () => {
    sitesRows = [siteRow({ published: false })];
    const { POST } = await import('../route');
    const res = await POST(req());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Publiez un site pour débloquer le marketing.');
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('le message métier n’est JAMAIS servi à un non-propriétaire', async () => {
    sitesRows = [siteRow({ owner_id: 'autre', published: false })];
    const { POST } = await import('../route');
    const json = await (await POST(req())).json();

    expect(json.error).not.toBe('Publiez un site pour débloquer le marketing.');
  });

  it('`published` absent de la ligne -> refusé (fail-closed, `!== true`)', async () => {
    const r = siteRow(); delete (r as Row).published;
    sitesRows = [r];
    const { POST } = await import('../route');
    expect((await POST(req())).status).toBe(403);
  });
});

describe('DETTE 6a — validations et données transportées', () => {
  it('slug manquant -> 400', async () => {
    const { POST } = await import('../route');
    expect((await POST(req({ format: 'email' }))).status).toBe(400);
  });

  it('format invalide -> 400, aucun appel LLM', async () => {
    const { POST } = await import('../route');
    expect((await POST(req({ slug: 'ma-boutique', format: 'tiktok' }))).status).toBe(400);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('`owner_email` écrit dans marketing_assets vient du JETON, pas de la colonne', async () => {
    sitesRows = [siteRow({ owner_email: 'figee@example.com' })];   // colonne périmée
    const { POST } = await import('../route');
    await POST(req());

    expect(assetsInserted).toHaveLength(1);
    expect(assetsInserted[0].owner_email).toBe(USER.email);
  });
});
