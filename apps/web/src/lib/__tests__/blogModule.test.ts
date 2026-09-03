import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }));

import {
  ALLOWED_POST_FIELDS,
  filtrerChamps,
  slugifyArticleTitle,
  ecritureRefusee,
} from '@/lib/blog';

// ============================================================
// LOT BLOG 3 -- `src/lib/blog.ts`, MODULE UNIQUE D'ACCES A `site_blog_posts`.
//
// Les trois fonctions testees ici sont PURES et portent, a elles seules, les
// invariants que les routes se contentent d'appliquer : l'allowlist de
// champs, la forme du slug, et la traduction des erreurs de base en reponses
// controlees. Les tester ici plutot que route par route, c'est ce qui rend
// les quatre verbes couverts par construction.
// ============================================================

describe('filtrerChamps — l’allowlist, seule barrière du corps de requête', () => {
  it('retient exactement les six champs autorisés', () => {
    expect([...ALLOWED_POST_FIELDS]).toEqual([
      'title', 'slug', 'excerpt', 'content', 'cover_image', 'published',
    ]);
  });

  it('`site_id` — l’appartenance — n’est JAMAIS retenu', () => {
    expect(filtrerChamps({ site_id: 'autre-site', title: 'T' })).toEqual({ title: 'T' });
  });

  it('`id`, `created_at`, `updated_at`, `published_at`, `cover_storage_path` sont écartés', () => {
    const r = filtrerChamps({
      id: 'x', created_at: 'c', updated_at: 'u',
      published_at: '1999-01-01', cover_storage_path: 'blog/autre/vol.png',
    });
    expect(r).toEqual({});
  });

  it('un champ inconnu est IGNORÉ, jamais rejeté — sémantique des produits', () => {
    expect(filtrerChamps({ nimporte_quoi: 1, title: 'T' })).toEqual({ title: 'T' });
  });

  it('un corps qui n’est pas un objet ne fait pas lever', () => {
    for (const v of [null, undefined, 'x', 42, true]) {
      expect(filtrerChamps(v), String(v)).toEqual({});
    }
  });

  it('une valeur `undefined` explicite reste distinguable d’une absence', () => {
    expect('title' in filtrerChamps({ title: undefined })).toBe(true);
    expect('title' in filtrerChamps({})).toBe(false);
  });
});

describe('slugifyArticleTitle — la sortie satisfait TOUJOURS la contrainte de base', () => {
  const CHK = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  const CAS: [string, unknown, string][] = [
    ['accents retirés', 'Nos Horaires d’Été', 'nos-horaires-d-ete'],
    ['ponctuation', 'Pourquoi ? Comment !', 'pourquoi-comment'],
    ['espaces multiples', '  a   b  ', 'a-b'],
    ['déjà un slug', 'nos-horaires', 'nos-horaires'],
    ['traversée de chemin', '../../etc/passwd', 'etc-passwd'],
    ['vide -> repli', '', 'article'],
    ['non translittérable -> repli', 'مرحبا', 'article'],
    ['null -> repli', null, 'article'],
    ['nombre', 12345, '12345'],
  ];

  for (const [libelle, entree, attendu] of CAS) {
    it(`${libelle} -> "${attendu}"`, () => {
      expect(slugifyArticleTitle(entree)).toBe(attendu);
    });
  }

  it('TOUTE sortie respecte `site_blog_posts_slug_chk`', () => {
    const entrees = [
      ...CAS.map((c) => c[1]), 'A'.repeat(500), '---', '!!!', 'É'.repeat(200),
      'a'.repeat(119) + ' b', undefined, {}, [],
    ];
    for (const e of entrees) {
      const s = slugifyArticleTitle(e);
      expect(s, String(e).slice(0, 30)).toMatch(CHK);
      expect(s.length, String(e).slice(0, 30)).toBeLessThanOrEqual(120);
    }
  });

  it('ne suffixe JAMAIS d’horodatage — une URL d’article doit rester lisible', () => {
    // `generateSlug` (chat/route.ts) le fait pour les SITES, où l'unicité est
    // globale. Ici l'unicité est portée par `UNIQUE (site_id, slug)`.
    expect(slugifyArticleTitle('Nos horaires')).toBe('nos-horaires');
    expect(slugifyArticleTitle('Nos horaires')).toBe(slugifyArticleTitle('Nos horaires'));
  });
});

describe('ecritureRefusee — aucune erreur Postgres ne traverse', () => {
  it('23505 (collision) -> 409, message métier', () => {
    const r = ecritureRefusee({ code: '23505', message: 'duplicate key value violates unique constraint "site_blog_posts_site_slug_uidx"' });
    expect(r).toEqual({ status: 409, error: 'Un article de ce site utilise déjà ce lien.' });
  });

  it('23514 (CHECK) -> 400, message métier', () => {
    expect(ecritureRefusee({ code: '23514', message: 'x' })?.status).toBe(400);
  });

  it('erreur inconnue -> null : l’appelant la traite en incident', () => {
    for (const e of [new Error('boom'), { code: '08006' }, null, undefined, 'x']) {
      expect(ecritureRefusee(e), String(e)).toBeNull();
    }
  });

  it('AUCUN message rendu ne dérive du texte Postgres', () => {
    const brut = 'duplicate key ... constraint "site_blog_posts_site_slug_uidx" ... relation';
    for (const code of ['23505', '23514']) {
      const r = ecritureRefusee({ code, message: brut })!;
      expect(r.error).not.toMatch(/constraint|duplicate|relation|uidx|postgres/i);
    }
  });
});

// ============================================================
// CLIQUET STRUCTUREL
// ============================================================
describe('cliquet structurel', () => {
  const LIB = join(__dirname, '..');
  const SRC = readFileSync(join(LIB, 'blog.ts'), 'utf-8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('la table est `site_blog_posts` — JAMAIS `blog_posts`, le blog de la PLATEFORME', () => {
    // `blog_posts` n'a AUCUNE colonne de site (schéma vérifié en base) : la
    // brancher ici ferait s'effondrer toute la chaîne de propriété, et sa
    // lecture est accordée à `anon`.
    expect((CODE.match(/from\('site_blog_posts'\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(CODE).not.toMatch(/['"]blog_posts['"]/);
  });

  it('`updatePost` et `deletePost` filtrent sur `(id, site_id)`, jamais sur `id` seul', () => {
    // Second verrou, LOCAL à l'écriture : si un appelant transmettait un
    // identifiant autre que celui qu'il a fait vérifier, la requête ne
    // toucherait aucune ligne au lieu d'écrire chez un autre locataire.
    for (const fn of ['updatePost', 'deletePost']) {
      const corps = CODE.slice(CODE.indexOf(`export async function ${fn}`));
      const bloc = corps.slice(0, corps.indexOf('\n}'));
      expect(bloc, fn).toMatch(/\.eq\('id', id\)/);
      expect(bloc, fn).toMatch(/\.eq\('site_id', siteId\)/);
    }
  });

  /** Corps d'une fonction exportée, borné à la suivante — un `slice` non borné
   *  déborderait sur la fonction d'après et fausserait tout comptage. */
  const bloc = (nom: string) => {
    const deb = CODE.indexOf(`export async function ${nom}`);
    expect(deb, nom).toBeGreaterThan(-1);
    const suite = CODE.indexOf('\nexport ', deb + 1);
    return CODE.slice(deb, suite === -1 ? undefined : suite);
  };

  it('`setPostCover` filtre sur `(id, site_id)` — en lecture ET en écriture', () => {
    const corps = bloc('setPostCover');
    expect((corps.match(/\.eq\('id', id\)/g) ?? []).length).toBe(2);
    expect((corps.match(/\.eq\('site_id', siteId\)/g) ?? []).length).toBe(2);
  });

  it('`cover_storage_path` n’est ÉCRITE que par `setPostCover`', () => {
    // Elle est absente d'`ALLOWED_POST_FIELDS` : la seule façon de l'écrire
    // doit rester un acte serveur nommé, dont le chemin vient d'être calculé.
    // (Le type `SiteBlogPost` la DÉCLARE, ce qui n'est pas l'écrire.)
    expect(ALLOWED_POST_FIELDS as readonly string[]).not.toContain('cover_storage_path');
    const ECRITURE = /cover_storage_path: storagePath/g;
    expect((CODE.match(ECRITURE) ?? []).length).toBe(1);
    expect(bloc('setPostCover')).toMatch(ECRITURE);
    for (const autre of ['createPost', 'updatePost', 'deletePost', 'listPosts', 'getArticle']) {
      expect(bloc(autre), autre).not.toMatch(/cover_storage_path:/);
    }
  });

  it('`createPost` pose `site_id` APRÈS l’étalement — un `site_id` du corps ne peut pas gagner', () => {
    expect(CODE).toMatch(/insert\(\{ \.\.\.valeurs, site_id: siteId \}\)/);
  });

  it('AUCUN `canTransact` — le blog est commun aux trois modes', () => {
    expect(CODE).not.toMatch(/canTransact|commerce-admission/);
  });

  it('le module ne lit AUCUN corps de requête ni aucun jeton', () => {
    expect(CODE).not.toMatch(/req\.|Request|headers|authorization|auth\.getUser|NextResponse/);
  });

  it('`site_blog_posts` n’est nommée QUE dans ce module (hors tests et SQL)', () => {
    const SRCDIR = join(LIB, '..');
    const fichiers: string[] = [];
    (function walk(d: string) {
      for (const e of readdirSync(d)) {
        const f = join(d, e);
        if (statSync(f).isDirectory()) walk(f);
        else if (/\.tsx?$/.test(e) && !f.includes('__tests__')) fichiers.push(f);
      }
    })(SRCDIR);
    const porteurs = fichiers
      .filter((f) => /from\(['"]site_blog_posts['"]\)/.test(readFileSync(f, 'utf-8')))
      .map((f) => f.replace(SRCDIR, 'src'));
    expect(porteurs).toEqual(['src/lib/blog.ts']);
  });
});
