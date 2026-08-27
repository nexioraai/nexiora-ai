import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { creerFrom, journalVierge } from '@/lib/testing/postgrest';

// ============================================================
// LOT BLOG 4 -- POST /api/blog/posts/generate.
//
// Ce que ce fichier doit prouver, au-dela du nominal :
//   1. le moteur du lot 2 est REUTILISE, pas recopie ;
//   2. la depense est bornee AVANT le premier appel facture ;
//   3. le brouillon nait non publie, rattache au site VERIFIE ;
//   4. `structure` n'est pas stockee, `contenu` l'est -- ce ne sont pas
//      la meme chose.
// ============================================================

const requireSiteOwnerMock = vi.fn();
vi.mock('@/lib/auth/require-site-owner', () => ({
  requireSiteOwner: (...a: unknown[]) => requireSiteOwnerMock(...a),
}));

const jetonMock = vi.fn();
vi.mock('@/lib/rate-limit/rateLimit', () => ({
  consommerJeton: (...a: unknown[]) => jetonMock(...a),
}));

const anthropicMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...a: unknown[]) => anthropicMock(...a) };
  },
}));

const logAiUsageMock = vi.fn();
vi.mock('@/lib/ai-usage', () => ({ logAiUsage: (...a: unknown[]) => logAiUsageMock(...a) }));

// HARNAIS FIDELE, impose par le cliquet `postgrestProjectionFidelity` : il
// honore la projection comme PostgREST et CAPTURE les filtres poses. Un double
// permissif (`select: () => b`) rendrait le retrait d'un `.eq(...)` strictement
// inobservable -- c'est le defaut DEBT-068 / P5-01, qui avait deja masque une
// panne totale en production.
const journal = journalVierge();
let briefReponse: { data: unknown; error: unknown } = { data: null, error: null };
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (t: string) => creerFrom({ marketing_briefs: { reponse: () => briefReponse } }, journal)(t),
  },
}));

const createPostMock = vi.fn();
vi.mock('@/lib/blog', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createPost: (...a: unknown[]) => createPostMock(...a),
}));

import { POST } from '../route';

const SITE_ID = 'site-a-uuid';
const ARTICLE_IA = {
  titre: "Nos Horaires d'Été",
  meta_description: 'Une description de 150 caractères environ.',
  mots_cles: ['horaires', 'été'],
  structure: [{ niveau: 'h2', texte: 'Un titre de plan' }],
  contenu: 'Le corps complet de l’article, en prose.',
};

const req = (body: unknown) =>
  new Request('https://x.test/api/blog/posts/generate', {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const reponseIA = (obj: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(obj) }],
  usage: { input_tokens: 10, output_tokens: 20 },
});

beforeEach(() => {
  requireSiteOwnerMock.mockReset().mockResolvedValue({
    ok: true, email: 'a@x.test', site: { id: SITE_ID, name: 'Site A', area_served: 'Tchad' },
  });
  jetonMock.mockReset().mockResolvedValue({ ok: true });
  anthropicMock.mockReset().mockResolvedValue(reponseIA(ARTICLE_IA));
  logAiUsageMock.mockReset().mockResolvedValue(undefined);
  briefReponse = { data: { brief: { ton: 'expert' } }, error: null };
  for (const c of [journal.filtres, journal.projections, journal.ecritures]) {
    for (const k of Object.keys(c)) delete (c as Record<string, unknown>)[k];
  }
  createPostMock.mockReset().mockImplementation((siteId, v) =>
    Promise.resolve({ id: 'article-1', site_id: siteId, ...v })
  );
});

describe('autorisation et dépense — dans cet ordre', () => {
  it('sans `site` -> 400, aucune vérification, aucune dépense', async () => {
    const r = await POST(req({}));
    expect(r.status).toBe(400);
    expect(requireSiteOwnerMock).not.toHaveBeenCalled();
    expect(anthropicMock).not.toHaveBeenCalled();
  });

  it('JSON invalide -> 400', async () => {
    expect((await POST(req('{cassé'))).status).toBe(400);
  });

  it('site NON possédé -> réponse de la primitive, AUCUN appel facturé', async () => {
    requireSiteOwnerMock.mockResolvedValue({
      ok: false, response: new Response(JSON.stringify({ error: 'Acces refuse.' }), { status: 403 }),
    });
    expect((await POST(req({ site: 'site-de-B' }))).status).toBe(403);
    expect(jetonMock).not.toHaveBeenCalled();
    expect(anthropicMock).not.toHaveBeenCalled();
  });

  it('la borne est consommée AVANT le premier appel Claude', async () => {
    jetonMock.mockResolvedValue({ ok: false, statut: 429, erreur: 'Trop de générations, réessayez dans une minute.' });
    const r = await POST(req({ site: 'mon-site' }));
    expect(r.status).toBe(429);
    expect(anthropicMock).not.toHaveBeenCalled();
    expect(createPostMock).not.toHaveBeenCalled();
  });

  it('la borne est posée sur le `site_id` VÉRIFIÉ', async () => {
    await POST(req({ site: 'mon-site' }));
    expect(jetonMock.mock.calls[0][0]).toMatchObject({ siteId: SITE_ID, plafond: 3 });
  });

  it('un compteur en panne REFUSE (503), il n’ouvre pas', async () => {
    jetonMock.mockResolvedValue({ ok: false, statut: 503, erreur: 'Service momentanément indisponible.' });
    expect((await POST(req({ site: 'mon-site' }))).status).toBe(503);
    expect(anthropicMock).not.toHaveBeenCalled();
  });
});

describe('réutilisation du moteur extrait au lot 2', () => {
  it('cache de brief présent -> UN SEUL appel Claude (le contenu)', async () => {
    await POST(req({ site: 'mon-site' }));
    expect(anthropicMock).toHaveBeenCalledTimes(1);
    expect(anthropicMock.mock.calls[0][0].model).toBe('claude-sonnet-4-6');
  });

  it('cache absent -> brief généré (Haiku) puis contenu (Sonnet), et mis en cache', async () => {
    briefReponse = { data: null, error: null };
    anthropicMock
      .mockResolvedValueOnce(reponseIA({ ton: 'expert' }))
      .mockResolvedValueOnce(reponseIA(ARTICLE_IA));
    await POST(req({ site: 'mon-site' }));
    expect(anthropicMock).toHaveBeenCalledTimes(2);
    expect(anthropicMock.mock.calls[0][0].model).toBe('claude-haiku-4-5-20251001');
    // Le cache est LU avec la bonne projection et le bon filtre, jamais ECRIT.
    expect(journal.projections.marketing_briefs).toBe('brief');
    expect(journal.filtres.marketing_briefs).toContainEqual(['eq', 'slug', 'mon-site']);
    expect(journal.ecritures.marketing_briefs ?? []).toEqual([]);
  });

  it('les prompts envoyés sont bien ceux du module partagé', async () => {
    await POST(req({ site: 'mon-site' }));
    const prompt = anthropicMock.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain('Tu es un copywriter premium');
    expect(prompt).toContain('FORMAT : Article de blog SEO.');
  });

  it('le cache n’est JAMAIS écrit — la route ne devient pas un second écrivain', async () => {
    briefReponse = { data: null, error: null };
    anthropicMock
      .mockResolvedValueOnce(reponseIA({ ton: 'expert' }))
      .mockResolvedValueOnce(reponseIA(ARTICLE_IA));
    expect((await POST(req({ site: 'mon-site' }))).status).toBe(200);
    expect(journal.ecritures.marketing_briefs ?? []).toEqual([]);
  });

  it('chaque appel facturé est journalisé sur le bon site', async () => {
    await POST(req({ site: 'mon-site' }));
    expect(logAiUsageMock.mock.calls[0][0]).toMatchObject({ siteId: SITE_ID, usageType: 'blog' });
  });
});

describe('le brouillon produit', () => {
  it('naît NON publié et sans date de publication', async () => {
    await POST(req({ site: 'mon-site' }));
    const v = createPostMock.mock.calls[0][1];
    expect(v.published).toBe(false);
    expect(v.published_at).toBeNull();
  });

  it('est rattaché au `site_id` VÉRIFIÉ', async () => {
    await POST(req({ site: 'mon-site' }));
    expect(createPostMock.mock.calls[0][0]).toBe(SITE_ID);
  });

  it('`contenu` va dans `content`, `meta_description` dans `excerpt`', async () => {
    await POST(req({ site: 'mon-site' }));
    const v = createPostMock.mock.calls[0][1];
    expect(v.content).toBe(ARTICLE_IA.contenu);
    expect(v.excerpt).toBe(ARTICLE_IA.meta_description);
  });

  it('`structure` (le PLAN) n’est PAS stockée — ce n’est pas le contenu', async () => {
    await POST(req({ site: 'mon-site' }));
    const v = createPostMock.mock.calls[0][1];
    expect(v).not.toHaveProperty('structure');
    expect(v).not.toHaveProperty('mots_cles');
    expect(JSON.stringify(v)).not.toContain('Un titre de plan');
  });

  it('le slug est dérivé du titre et normalisé', async () => {
    await POST(req({ site: 'mon-site' }));
    expect(createPostMock.mock.calls[0][1].slug).toBe('nos-horaires-d-ete');
  });

  it('`cover_image` reste nul — l’image est le lot 5', async () => {
    await POST(req({ site: 'mon-site' }));
    expect(createPostMock.mock.calls[0][1].cover_image).toBeNull();
  });

  it('aucun `site_id` ni `id` ne vient de la sortie IA', async () => {
    anthropicMock.mockResolvedValue(reponseIA({ ...ARTICLE_IA, site_id: 'site-B', id: 'force' }));
    await POST(req({ site: 'mon-site' }));
    const v = createPostMock.mock.calls[0][1];
    expect(v).not.toHaveProperty('site_id');
    expect(v).not.toHaveProperty('id');
    expect(createPostMock.mock.calls[0][0]).toBe(SITE_ID);
  });
});

describe('collisions de slug et sorties inexploitables', () => {
  it('slug déjà pris -> SUFFIXÉ, jamais une génération perdue', async () => {
    createPostMock
      .mockRejectedValueOnce({ code: '23505' })
      .mockImplementationOnce((siteId, v) => Promise.resolve({ id: 'a', site_id: siteId, ...v }));
    const r = await POST(req({ site: 'mon-site' }));
    expect(r.status).toBe(200);
    expect(createPostMock.mock.calls[0][1].slug).toBe('nos-horaires-d-ete');
    expect(createPostMock.mock.calls[1][1].slug).toBe('nos-horaires-d-ete-2');
  });

  it('après 5 suffixes tous pris -> 409, message contrôlé', async () => {
    createPostMock.mockRejectedValue({ code: '23505', message: 'duplicate key ... uidx' });
    const r = await POST(req({ site: 'mon-site' }));
    expect(r.status).toBe(409);
    expect(createPostMock).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(await r.json())).not.toMatch(/duplicate|uidx|constraint/i);
  });

  it('sortie IA sans titre -> 502, aucune écriture', async () => {
    anthropicMock.mockResolvedValue(reponseIA({ contenu: 'x' }));
    const r = await POST(req({ site: 'mon-site' }));
    expect(r.status).toBe(502);
    expect(createPostMock).not.toHaveBeenCalled();
  });

  it('sortie IA non JSON -> 503 constant, aucun texte technique', async () => {
    anthropicMock.mockResolvedValue({ content: [{ type: 'text', text: 'pas du json' }], usage: {} });
    const r = await POST(req({ site: 'mon-site' }));
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toMatch(/JSON|token|Unexpected/i);
  });
});

describe('cliquet structurel', () => {
  const SRC = readFileSync(join(__dirname, '../route.ts'), 'utf-8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('AUCUN prompt n’est recopié : le moteur est IMPORTÉ', () => {
    expect(CODE).toContain("from '@/lib/marketing/prompts'");
    expect(CODE).not.toMatch(/Tu es un (stratège|copywriter)/);
  });

  it('AUCUN `canTransact` — le blog est commun aux trois modes', () => {
    expect(CODE).not.toMatch(/canTransact|commerce-admission/);
  });

  it('AUCUNE garde « site publié » — elle appartient au marketing, pas au blog', () => {
    expect(CODE).not.toMatch(/published !== true|Publiez un site/);
  });

  it('la table n’est pas nommée ici : l’écriture passe par `@/lib/blog`', () => {
    expect(CODE).not.toMatch(/site_blog_posts|from\(['"]blog_posts['"]\)/);
    expect(CODE).toContain("from '@/lib/blog'");
  });

  it('la borne de dépense précède le premier appel Claude', () => {
    expect(CODE.indexOf('consommerJeton')).toBeLessThan(CODE.indexOf('anthropic.messages.create'));
  });

  it('le cache marketing n’est jamais ÉCRIT — `owner_email` reste hors de ce lot', () => {
    expect(CODE).not.toMatch(/\.upsert\(|auth\.email|owner_email/);
    expect(CODE).toContain("from('marketing_briefs')");
  });

  it('le brouillon est écrit `published: false` en dur', () => {
    expect(CODE).toMatch(/published: false/);
    expect(CODE).toMatch(/published_at: null/);
  });
});
