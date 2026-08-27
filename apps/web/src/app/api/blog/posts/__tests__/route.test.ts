import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================
// LOT BLOG 3 -- GET / POST /api/blog/posts.
//
// Les helpers PURS de `@/lib/blog` (`filtrerChamps`, `slugifyArticleTitle`,
// `ecritureRefusee`) restent REELS : ce sont eux qui portent l'allowlist et
// la normalisation, donc les mocker reviendrait a tester un decor. Seuls les
// acces base sont remplaces.
// ============================================================

// `importOriginal` charge le VRAI `@/lib/blog`, donc `@/lib/supabase-admin`,
// qui leve sans SUPABASE_SERVICE_ROLE_KEY. On le neutralise : aucun acces base
// ne passe par lui ici, les deux accesseurs utilises sont mockes plus bas.
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }));

const requireSiteOwnerMock = vi.fn();
vi.mock('@/lib/auth/require-site-owner', () => ({
  requireSiteOwner: (...a: unknown[]) => requireSiteOwnerMock(...a),
}));

const listPostsMock = vi.fn();
const createPostMock = vi.fn();
vi.mock('@/lib/blog', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listPosts: (...a: unknown[]) => listPostsMock(...a),
  createPost: (...a: unknown[]) => createPostMock(...a),
}));

import { GET, POST } from '../route';

const SITE_A = 'site-a-uuid';
const SITE_B = 'site-b-uuid';

const get = (qs: string) =>
  new Request(`https://x.test/api/blog/posts${qs}`, { headers: { authorization: 'Bearer t' } });
const post = (body: unknown) =>
  new Request('https://x.test/api/blog/posts', {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  requireSiteOwnerMock.mockReset().mockResolvedValue({ ok: true, site: { id: SITE_A } });
  listPostsMock.mockReset().mockResolvedValue([]);
  createPostMock.mockReset().mockImplementation((siteId: string, v: Record<string, unknown>) =>
    Promise.resolve({ id: 'article-1', site_id: siteId, ...v })
  );
});

describe('GET — surface propriétaire', () => {
  it('sans `site` -> 400, aucune requête', async () => {
    const r = await GET(get(''));
    expect(r.status).toBe(400);
    expect(requireSiteOwnerMock).not.toHaveBeenCalled();
    expect(listPostsMock).not.toHaveBeenCalled();
  });

  it('site possédé -> liste, résolue par le `site_id` VÉRIFIÉ', async () => {
    listPostsMock.mockResolvedValue([{ id: 'a', published: false }]);
    const r = await GET(get('?site=mon-site'));
    expect(r.status).toBe(200);
    expect((await r.json()).posts).toHaveLength(1);
    expect(listPostsMock).toHaveBeenCalledWith(SITE_A);
  });

  it('les BROUILLONS sont visibles du propriétaire — c’est sa surface', async () => {
    listPostsMock.mockResolvedValue([{ id: 'a', published: false }, { id: 'b', published: true }]);
    const r = await GET(get('?site=mon-site'));
    expect((await r.json()).posts.map((p: { id: string }) => p.id)).toEqual(['a', 'b']);
  });

  it('site NON possédé -> la réponse de la primitive, telle quelle', async () => {
    requireSiteOwnerMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Acces refuse.' }), { status: 403 }),
    });
    expect((await GET(get('?site=site-de-B'))).status).toBe(403);
    expect(listPostsMock).not.toHaveBeenCalled();
  });

  it('`?site_id=` est IGNORÉ — il n’existe aucun chemin qui le lise', async () => {
    await GET(get(`?site=mon-site&site_id=${SITE_B}`));
    expect(listPostsMock).toHaveBeenCalledWith(SITE_A);
  });

  it('une panne base -> 503 à message CONSTANT, aucun texte Postgres', async () => {
    listPostsMock.mockRejectedValue(new Error('listPosts: relation does not exist'));
    const r = await GET(get('?site=mon-site'));
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toMatch(/relation|listPosts|postgres/i);
  });
});

describe('POST — création, et `site_id` jamais reçu', () => {
  it('sans `site` -> 400 avant toute vérification', async () => {
    const r = await POST(post({ title: 'T' }));
    expect(r.status).toBe(400);
    expect(requireSiteOwnerMock).not.toHaveBeenCalled();
  });

  it('JSON invalide -> 400, jamais 500', async () => {
    expect((await POST(post('{pas du json'))).status).toBe(400);
  });

  it('sans `title` -> 400, aucune écriture', async () => {
    const r = await POST(post({ site: 'mon-site' }));
    expect(r.status).toBe(400);
    expect(createPostMock).not.toHaveBeenCalled();
  });

  it('titre fait d’espaces -> 400', async () => {
    expect((await POST(post({ site: 'mon-site', title: '   ' }))).status).toBe(400);
  });

  it('création nominale : `site_id` vient du site VÉRIFIÉ', async () => {
    const r = await POST(post({ site: 'mon-site', title: 'Nos horaires' }));
    expect(r.status).toBe(200);
    expect(createPostMock.mock.calls[0][0]).toBe(SITE_A);
  });

  it('`site_id` dans le CORPS est IGNORÉ — allowlist', async () => {
    await POST(post({ site: 'mon-site', title: 'T', site_id: SITE_B }));
    const [siteId, valeurs] = createPostMock.mock.calls[0];
    expect(siteId).toBe(SITE_A);
    expect(valeurs).not.toHaveProperty('site_id');
  });

  it('`id`, `created_at`, `updated_at`, `cover_storage_path` sont IGNORÉS', async () => {
    await POST(post({
      site: 'mon-site', title: 'T',
      id: 'force', created_at: '1999-01-01', updated_at: '1999-01-01',
      cover_storage_path: 'blog/autre-site/vol.png',
    }));
    const valeurs = createPostMock.mock.calls[0][1];
    for (const interdit of ['id', 'created_at', 'updated_at', 'cover_storage_path']) {
      expect(valeurs, interdit).not.toHaveProperty(interdit);
    }
  });

  it('`published_at` du client est IGNORÉ — il est DÉRIVÉ', async () => {
    await POST(post({ site: 'mon-site', title: 'T', published: true, published_at: '1999-01-01T00:00:00Z' }));
    const valeurs = createPostMock.mock.calls[0][1];
    expect(valeurs.published_at).not.toBe('1999-01-01T00:00:00Z');
    expect(new Date(valeurs.published_at as string).getFullYear()).toBeGreaterThan(2020);
  });

  it('un brouillon naît `published: false` et SANS date de publication', async () => {
    await POST(post({ site: 'mon-site', title: 'T' }));
    const valeurs = createPostMock.mock.calls[0][1];
    expect(valeurs.published).toBe(false);
    expect(valeurs.published_at).toBeNull();
  });

  it('`published` non booléen -> 400, aucune écriture', async () => {
    const r = await POST(post({ site: 'mon-site', title: 'T', published: 'oui' }));
    expect(r.status).toBe(400);
    expect(createPostMock).not.toHaveBeenCalled();
  });

  it('slug dérivé du titre quand il est absent, et normalisé', async () => {
    await POST(post({ site: 'mon-site', title: 'Nos Horaires d’Été !' }));
    expect(createPostMock.mock.calls[0][1].slug).toBe('nos-horaires-d-ete');
  });

  it('slug fourni par le client : NORMALISÉ, jamais accepté brut', async () => {
    await POST(post({ site: 'mon-site', title: 'T', slug: '../../Autre Site/' }));
    const slug = createPostMock.mock.calls[0][1].slug as string;
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(slug).not.toContain('/');
    expect(slug).not.toContain('..');
  });

  it('collision de slug dans le MÊME site -> 409, message contrôlé', async () => {
    createPostMock.mockRejectedValue({ code: '23505', message: 'duplicate key value violates unique constraint "site_blog_posts_site_slug_uidx"' });
    const r = await POST(post({ site: 'mon-site', title: 'Nos horaires' }));
    expect(r.status).toBe(409);
    expect(JSON.stringify(await r.json())).not.toMatch(/constraint|duplicate|uidx|postgres/i);
  });

  it('violation de CHECK -> 400, message contrôlé', async () => {
    createPostMock.mockRejectedValue({ code: '23514', message: 'violates check constraint "site_blog_posts_slug_chk"' });
    const r = await POST(post({ site: 'mon-site', title: 'T' }));
    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).not.toMatch(/constraint|chk/i);
  });

  it('panne inconnue -> 503 à message constant', async () => {
    createPostMock.mockRejectedValue(new Error('connection refused to db-1.internal'));
    const r = await POST(post({ site: 'mon-site', title: 'T' }));
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toMatch(/connection|internal|db-1/i);
  });

  it('le MÊME slug sur DEUX sites différents part bien vers deux `site_id` distincts', async () => {
    await POST(post({ site: 'site-a', title: 'Nos horaires' }));
    requireSiteOwnerMock.mockResolvedValue({ ok: true, site: { id: SITE_B } });
    await POST(post({ site: 'site-b', title: 'Nos horaires' }));
    expect(createPostMock.mock.calls[0][1].slug).toBe(createPostMock.mock.calls[1][1].slug);
    expect(createPostMock.mock.calls[0][0]).toBe(SITE_A);
    expect(createPostMock.mock.calls[1][0]).toBe(SITE_B);
  });
});

describe('cliquet structurel', () => {
  const SRC = readFileSync(join(__dirname, '../route.ts'), 'utf-8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('AUCUN `canTransact` — le blog est commun aux trois modes', () => {
    expect(CODE).not.toMatch(/canTransact|commerce-admission/);
  });

  it('`site_id` n’est JAMAIS lu depuis le corps ni depuis l’URL', () => {
    expect(CODE).not.toMatch(/body[\s\S]{0,20}site_id|searchParams\.get\(\s*['"]site_id/);
  });

  it('la propriété n’est pas réimplémentée : `requireSiteOwner` est la seule autorité', () => {
    expect(CODE).toContain('requireSiteOwner');
    expect(CODE).not.toMatch(/owner_id|owner_email|auth\.getUser/);
  });

  it('la table n’est jamais nommée ici — tout passe par `@/lib/blog`', () => {
    expect(CODE).not.toMatch(/site_blog_posts|blog_posts|supabaseAdmin/);
  });
});
