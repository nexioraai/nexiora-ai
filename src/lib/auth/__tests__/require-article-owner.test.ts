import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================
// LOT BLOG 1 -- LA PRIMITIVE DE PROPRIETE DES ARTICLES.
//
// Ce fichier teste la primitive DIRECTEMENT, la ou la decision vit, et non
// route par route : c'est ce qui garantit que TOUTES les ecritures d'article
// a venir (PATCH, DELETE, publication, depublication, couverture) sont
// couvertes par construction plutot que par repetition -- meme raison qu'au
// fichier voisin `require-product-owner.uuid.test.ts`.
//
// DEUX EXIGENCES DISTINCTES SONT VERIFIEES ICI :
//   1. le 404 UNIFORME sur les trois echecs (forme, inexistence, autre
//      locataire) -- l'anti-enumeration ;
//   2. l'ABSENCE de `canTransact` -- le blog est commun aux trois modes, et
//      cette absence doit etre protegee contre une « correction » ulterieure.
// ============================================================

const maybeSingleMock = vi.fn();
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => fromMock(...(a as [])) },
}));

const requireSiteOwnerByIdMock = vi.fn();
vi.mock('../require-site-owner', () => ({
  requireSiteOwnerById: (...a: unknown[]) => requireSiteOwnerByIdMock(...a),
}));

import { requireArticleOwner } from '../require-article-owner';

const VALIDE = '11111111-1111-4111-8111-111111111111';
const ARTICLE = { id: VALIDE, site_id: 'site-A', slug: 'nos-horaires', published: false };
const req = () => new Request('https://x.test/', { headers: { authorization: 'Bearer t' } });

beforeEach(() => {
  maybeSingleMock.mockReset().mockResolvedValue({ data: ARTICLE, error: null });
  eqMock.mockClear();
  selectMock.mockClear();
  fromMock.mockClear();
  requireSiteOwnerByIdMock.mockReset().mockResolvedValue({ ok: true, site: { id: 'site-A' } });
});

const MALFORMES = [
  ['chaîne quelconque', 'not-a-uuid'],
  ['vide', ''],
  ['traversée de chemin', '../../etc/passwd'],
  ['injection SQL', "1' or '1'='1"],
  ['un chiffre de trop', '11111111-1111-4111-8111-1111111111111'],
  ['un chiffre de moins', '11111111-1111-4111-8111-11111111111'],
  ['caractère non hexadécimal', '1111111z-1111-4111-8111-111111111111'],
  ['sans tirets (Postgres l’accepterait)', '11111111111141118111111111111111'],
  ['entre accolades (Postgres l’accepterait)', '{11111111-1111-4111-8111-111111111111}'],
  ['espaces autour', ' 11111111-1111-4111-8111-111111111111 '],
] as const;

describe('a) un identifiant malformé ne désigne aucun article', () => {
  for (const [libelle, valeur] of MALFORMES) {
    it(`${libelle} -> 404, message contrôlé, aucune requête`, async () => {
      const r = await requireArticleOwner(req(), valeur);

      expect('error' in r, libelle).toBe(true);
      const res = (r as { error: Response }).error;
      expect(res.status, libelle).toBe(404);
      expect((await res.json()).error, libelle).toBe('Article not found');

      // Rien n'est parti : ni vers la base, ni vers la garde de propriété.
      expect(fromMock, libelle).not.toHaveBeenCalled();
      expect(requireSiteOwnerByIdMock, libelle).not.toHaveBeenCalled();
    });
  }

  it('AUCUNE réponse ne laisse fuir un message Postgres', async () => {
    for (const [, valeur] of MALFORMES) {
      const r = await requireArticleOwner(req(), valeur);
      const brut = JSON.stringify(await (r as { error: Response }).error.json());
      expect(brut).not.toMatch(/invalid input syntax|uuid|getArticle|postgres|column|type/i);
    }
  });
});

describe('404 UNIFORME — les trois échecs sont indiscernables', () => {
  const corps = async (r: unknown) => {
    const res = (r as { error: Response }).error;
    return { status: res.status, body: await res.json() };
  };

  it('a) forme invalide, b) article inexistant, c) article d’un AUTRE site -> réponse identique', async () => {
    // a) forme invalide
    const a = await corps(await requireArticleOwner(req(), 'not-a-uuid'));

    // b) uuid bien formé, article inexistant
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const b = await corps(await requireArticleOwner(req(), VALIDE));

    // c) article RÉEL, mais site appartenant à quelqu'un d'autre -> la
    //    primitive canonique rend 403 ; la nôtre doit le convertir en 404.
    maybeSingleMock.mockResolvedValue({ data: ARTICLE, error: null });
    requireSiteOwnerByIdMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Acces refuse.' }), { status: 403 }),
    });
    const c = await corps(await requireArticleOwner(req(), VALIDE));

    expect(a.status).toBe(404);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    // Le message « Acces refuse. » ne doit jamais atteindre l'appelant : il
    // confirmerait que l'article existe chez un autre locataire.
    expect(JSON.stringify(c.body)).not.toMatch(/refus|denied|403/i);
  });

  it('un site introuvable (404 de la primitive canonique) rend AUSSI la même réponse', async () => {
    requireSiteOwnerByIdMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Site introuvable' }), { status: 404 }),
    });
    const r = await corps(await requireArticleOwner(req(), VALIDE));
    expect(r).toEqual(await corps(await requireArticleOwner(req(), 'not-a-uuid')));
  });

  it('401 est CONSERVÉ — il n’apprend rien sur la ressource et un client légitime en a besoin', async () => {
    requireSiteOwnerByIdMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Non authentifie.' }), { status: 401 }),
    });
    const res = (await requireArticleOwner(req(), VALIDE)) as { error: Response };
    expect(res.error.status).toBe(401);
  });
});

describe('le chemin nominal se déroule, et `site_id` vient de la BASE', () => {
  it('article possédé -> ok, article rendu', async () => {
    const r = await requireArticleOwner(req(), VALIDE);
    expect('ok' in r && r.ok).toBe(true);
    expect((r as { article: typeof ARTICLE }).article).toEqual(ARTICLE);
  });

  it('MAJUSCULES acceptées (PostgREST rend du minuscule, un client peut renvoyer autre chose)', async () => {
    const r = await requireArticleOwner(req(), VALIDE.toUpperCase());
    expect('ok' in r && r.ok).toBe(true);
  });

  it('le `site_id` transmis à la garde est celui LU sur l’article, jamais un paramètre', async () => {
    await requireArticleOwner(req(), VALIDE);
    expect(fromMock).toHaveBeenCalledWith('site_blog_posts');
    expect(requireSiteOwnerByIdMock).toHaveBeenCalledTimes(1);
    expect(requireSiteOwnerByIdMock.mock.calls[0][1]).toBe('site-A');
  });

  it('la projection demandée est `id` SEUL — jamais `mode`', async () => {
    await requireArticleOwner(req(), VALIDE);
    expect(requireSiteOwnerByIdMock.mock.calls[0][2]).toBe('id');
  });

  it('une panne de base ne rend JAMAIS `ok` — elle lève (fail-closed)', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'connection refused' } });
    await expect(requireArticleOwner(req(), VALIDE)).rejects.toThrow(/getArticle/);
  });
});

// ============================================================
// CLIQUET STRUCTUREL -- il porte sur le CODE EXECUTABLE, commentaires
// retires : les blocs d'explication du fichier nomment `canTransact` et
// `mode` pour dire pourquoi ils n'y sont pas.
// ============================================================
describe('cliquet structurel', () => {
  const SRC = readFileSync(join(__dirname, '../require-article-owner.ts'), 'utf-8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('AUCUN `canTransact` — le blog est commun aux trois modes', () => {
    // Si cette assertion échoue, c'est qu'une passe a introduit une garde de
    // mode sur une capacité de CONTENU. Lire le bloc dédié dans
    // `require-article-owner.ts` avant de « corriger » ce test.
    expect(CODE).not.toMatch(/canTransact/);
  });

  it('AUCUN import de `commerce-admission` — la garde ne peut pas entrer par la porte de service', () => {
    expect(CODE).not.toMatch(/commerce-admission/);
  });

  it('la colonne `mode` n’est jamais projetée — la projeter n’aurait d’autre usage que de la tester', () => {
    expect(CODE).not.toMatch(/['"]id,\s*mode['"]/);
    expect(CODE).toMatch(/requireSiteOwnerById\(req,\s*article\.site_id,\s*'id'\)/);
  });

  it('la vérification de forme précède la lecture — un ordre inverse ne protégerait plus rien', () => {
    // `getArticle` est DÉFINIE dans ce fichier (contrairement à `getProduct`,
    // qui est importé) : l'ordre doit donc être mesuré dans le CORPS de la
    // primitive, sinon on compare la déclaration et non l'appel.
    const CORPS = CODE.slice(CODE.indexOf('export async function requireArticleOwner'));
    const garde = CORPS.indexOf('UUID_CANONIQUE.test');
    const lecture = CORPS.indexOf('await getArticle(');
    expect(garde).toBeGreaterThan(-1);
    expect(lecture).toBeGreaterThan(-1);
    expect(garde).toBeLessThan(lecture);
  });

  it('LOT 3 — l’accès aux données est DÉLÉGUÉ à `@/lib/blog`, plus aucune table nommée ici', () => {
    // Au lot 1, `getArticle` vivait dans ce fichier et la garde vérifiait
    // qu'il lisait `site_blog_posts`. Le lot 3 l'a extrait vers `@/lib/blog`,
    // seul module à écrire un nom de table — c'est la condition annoncée au
    // lot 1, désormais remplie (quatre routes sont ses nouveaux appelants).
    // La garde « jamais `blog_posts` » a donc migré avec lui, dans
    // `src/lib/__tests__/blogModule.test.ts`.
    expect(CODE).toContain("from '@/lib/blog'");
    expect(CODE).toContain('await getArticle(');
    expect(CODE).not.toMatch(/site_blog_posts|blog_posts|supabaseAdmin|\.from\(/);
  });

  it('aucune RÉPONSE ne dérive d’une erreur — les messages rendus sont des constantes', () => {
    const reponses = CODE.match(/NextResponse\.json\([^;]*?\)/g) ?? [];
    expect(reponses.length).toBeGreaterThan(0);
    for (const r of reponses) expect(r, r).not.toMatch(/\$\{|e\.message|error\.message/);
    expect(CODE).toContain("error: 'Article not found'");
    expect(CODE).not.toMatch(/catch\s*\(/);
  });

  it('LOT 3 — la primitive ne porte plus AUCUNE interpolation', () => {
    // Le `throw new Error(`getArticle: ${...}`)` est parti avec l'accesseur.
    // Ce fichier ne fabrique donc plus une seule chaîne dynamique : tous ses
    // messages sont des constantes, sans exception à documenter.
    expect(CODE.match(/\$\{[^}]*\}/g) ?? []).toEqual([]);
  });
});
