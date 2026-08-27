import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================
// LOT BLOG 3 -- PATCH / DELETE /api/blog/posts/[id].
//
// C'est ICI que vit l'isolation inter-locataire la plus exposee : un
// identifiant d'article suffit a designer la ressource, sans passer par le
// site. Tout repose donc sur `requireArticleOwner` -- et sur le fait que le
// `site_id` d'ecriture vienne de l'article VERIFIE, jamais du corps.
// ============================================================

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }));

const requireArticleOwnerMock = vi.fn();
vi.mock('@/lib/auth/require-article-owner', () => ({
  requireArticleOwner: (...a: unknown[]) => requireArticleOwnerMock(...a),
}));

const updatePostMock = vi.fn();
const deletePostMock = vi.fn();
vi.mock('@/lib/blog', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  updatePost: (...a: unknown[]) => updatePostMock(...a),
  deletePost: (...a: unknown[]) => deletePostMock(...a),
}));

import { PATCH, DELETE } from '../route';

const ID = '11111111-1111-4111-8111-111111111111';
const SITE_A = 'site-a-uuid';
const SITE_B = 'site-b-uuid';
const ARTICLE = {
  id: ID, site_id: SITE_A, slug: 'nos-horaires', title: 'Nos horaires',
  excerpt: null, content: 'x', cover_image: null, cover_storage_path: null,
  published: false, published_at: null, created_at: 'c', updated_at: 'u',
};

const ctx = { params: Promise.resolve({ id: ID }) };
const patchReq = (body: unknown) =>
  new Request(`https://x.test/api/blog/posts/${ID}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const delReq = () =>
  new Request(`https://x.test/api/blog/posts/${ID}`, {
    method: 'DELETE', headers: { authorization: 'Bearer t' },
  });

beforeEach(() => {
  requireArticleOwnerMock.mockReset().mockResolvedValue({ ok: true, article: { ...ARTICLE } });
  updatePostMock.mockReset().mockImplementation((id, siteId, patch) =>
    Promise.resolve({ ...ARTICLE, ...patch, id, site_id: siteId })
  );
  deletePostMock.mockReset().mockResolvedValue(undefined);
});

describe('isolation inter-locataire', () => {
  it('article d’un AUTRE site -> 404 uniforme, aucune écriture', async () => {
    requireArticleOwnerMock.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 }),
    });
    const r = await PATCH(patchReq({ title: 'Piraté' }), { params: Promise.resolve({ id: ID }) });
    expect(r.status).toBe(404);
    expect(updatePostMock).not.toHaveBeenCalled();
  });

  it('DELETE d’un article d’un autre site -> 404, aucune suppression', async () => {
    requireArticleOwnerMock.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 }),
    });
    const r = await DELETE(delReq(), { params: Promise.resolve({ id: ID }) });
    expect(r.status).toBe(404);
    expect(deletePostMock).not.toHaveBeenCalled();
  });

  it('l’écriture porte le `site_id` de l’ARTICLE VÉRIFIÉ, pas du corps', async () => {
    await PATCH(patchReq({ title: 'Nouveau', site_id: SITE_B }), ctx);
    const [id, siteId, patch] = updatePostMock.mock.calls[0];
    expect(id).toBe(ID);
    expect(siteId).toBe(SITE_A);
    expect(patch).not.toHaveProperty('site_id');
  });

  it('DELETE filtre lui aussi sur `(id, site_id)`', async () => {
    await DELETE(delReq(), ctx);
    expect(deletePostMock).toHaveBeenCalledWith(ID, SITE_A);
  });

  it('la garde est appelée AVANT toute lecture du corps', async () => {
    requireArticleOwnerMock.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 }),
    });
    const r = await PATCH(patchReq('{json invalide'), { params: Promise.resolve({ id: ID }) });
    // 404 et non 400 : la propriété tranche avant la forme du corps.
    expect(r.status).toBe(404);
  });
});

describe('allowlist de champs', () => {
  it('`id`, `created_at`, `updated_at`, `cover_storage_path`, `published_at` sont IGNORÉS', async () => {
    await PATCH(patchReq({
      title: 'T', id: 'autre', created_at: '1999-01-01', updated_at: '1999-01-01',
      cover_storage_path: 'blog/autre/vol.png', published_at: '1999-01-01T00:00:00Z',
    }), ctx);
    const patch = updatePostMock.mock.calls[0][2];
    expect(Object.keys(patch)).toEqual(['title']);
  });

  it('un corps sans aucun champ autorisé -> 400, aucune écriture', async () => {
    const r = await PATCH(patchReq({ site_id: SITE_B, id: 'x' }), ctx);
    expect(r.status).toBe(400);
    expect(updatePostMock).not.toHaveBeenCalled();
  });

  it('JSON invalide -> 400', async () => {
    expect((await PATCH(patchReq('{cassé'), ctx)).status).toBe(400);
  });

  it('titre vide -> 400', async () => {
    expect((await PATCH(patchReq({ title: '   ' }), ctx)).status).toBe(400);
  });

  it('slug modifié : NORMALISÉ, jamais brut', async () => {
    await PATCH(patchReq({ slug: '../Autre Site/!' }), ctx);
    const slug = updatePostMock.mock.calls[0][2].slug as string;
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe('publication — `published_at` est DÉRIVÉ', () => {
  it('publier un brouillon pose la date', async () => {
    await PATCH(patchReq({ published: true }), ctx);
    const patch = updatePostMock.mock.calls[0][2];
    expect(patch.published).toBe(true);
    expect(new Date(patch.published_at as string).getFullYear()).toBeGreaterThan(2020);
  });

  it('republier n’écrase PAS la date d’origine', async () => {
    requireArticleOwnerMock.mockResolvedValue({
      ok: true, article: { ...ARTICLE, published: false, published_at: '2020-01-01T00:00:00Z' },
    });
    await PATCH(patchReq({ published: true }), ctx);
    expect(updatePostMock.mock.calls[0][2]).not.toHaveProperty('published_at');
  });

  it('dépublier CONSERVE la date — `datePublished` décrit la première parution', async () => {
    requireArticleOwnerMock.mockResolvedValue({
      ok: true, article: { ...ARTICLE, published: true, published_at: '2020-01-01T00:00:00Z' },
    });
    await PATCH(patchReq({ published: false }), ctx);
    const patch = updatePostMock.mock.calls[0][2];
    expect(patch.published).toBe(false);
    expect(patch).not.toHaveProperty('published_at');
  });

  it('`published` non booléen -> 400, aucune écriture', async () => {
    const r = await PATCH(patchReq({ published: 'true' }), ctx);
    expect(r.status).toBe(400);
    expect(updatePostMock).not.toHaveBeenCalled();
  });
});

describe('erreurs de base — messages contrôlés', () => {
  it('collision de slug -> 409, aucun texte Postgres', async () => {
    updatePostMock.mockRejectedValue({ code: '23505', message: 'duplicate key ... site_blog_posts_site_slug_uidx' });
    const r = await PATCH(patchReq({ slug: 'deja-pris' }), ctx);
    expect(r.status).toBe(409);
    expect(JSON.stringify(await r.json())).not.toMatch(/duplicate|uidx|constraint/i);
  });

  it('violation de CHECK -> 400, aucun texte Postgres', async () => {
    updatePostMock.mockRejectedValue({ code: '23514', message: 'check constraint site_blog_posts_title_chk' });
    const r = await PATCH(patchReq({ title: 'T' }), ctx);
    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).not.toMatch(/constraint|chk/i);
  });

  it('panne inconnue -> 503 constant', async () => {
    updatePostMock.mockRejectedValue(new Error('connection refused db-1.internal'));
    const r = await PATCH(patchReq({ title: 'T' }), ctx);
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toMatch(/connection|db-1/i);
  });

  it('une mise à jour qui ne touche AUCUNE ligne -> 404, jamais un faux succès', async () => {
    updatePostMock.mockResolvedValue(null);
    expect((await PATCH(patchReq({ title: 'T' }), ctx)).status).toBe(404);
  });

  it('panne à la suppression -> 503 constant', async () => {
    deletePostMock.mockRejectedValue(new Error('deletePost: timeout on db-1'));
    const r = await DELETE(delReq(), ctx);
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toMatch(/timeout|db-1|deletePost/i);
  });
});

describe('chemin nominal', () => {
  it('PATCH possédé -> 200 et article rendu', async () => {
    const r = await PATCH(patchReq({ title: 'Nouveau titre' }), ctx);
    expect(r.status).toBe(200);
    expect((await r.json()).post.title).toBe('Nouveau titre');
  });

  it('DELETE possédé -> 200 ok', async () => {
    const r = await DELETE(delReq(), ctx);
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  });
});

describe('cliquet structurel', () => {
  const SRC = readFileSync(join(__dirname, '../route.ts'), 'utf-8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('AUCUN `canTransact`', () => {
    expect(CODE).not.toMatch(/canTransact|commerce-admission/);
  });

  it('les DEUX verbes passent par `requireArticleOwner` — un seul point de décision', () => {
    for (const verbe of ['PATCH', 'DELETE']) {
      const bloc = CODE.match(new RegExp(`export async function ${verbe}\\([\\s\\S]*?requireArticleOwner`));
      expect(bloc, verbe).not.toBeNull();
    }
  });

  it('la propriété n’est pas réimplémentée, et la table n’est pas nommée ici', () => {
    expect(CODE).not.toMatch(/owner_id|owner_email|auth\.getUser|supabaseAdmin/);
    expect(CODE).not.toMatch(/site_blog_posts|from\(['"]blog_posts['"]\)/);
  });

  it('`site_id` d’écriture vient de l’article, jamais du corps', () => {
    expect(CODE).toMatch(/article\.site_id/);
    expect(CODE).not.toMatch(/body[\s\S]{0,20}site_id/);
  });
});
