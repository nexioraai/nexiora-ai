import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BROUILLON_VIDE, versBrouillon, corpsCreation, corpsModification,
  peutEnregistrer, peutPublier, cleErreur, refusCouverture,
  COVER_TAILLE_MAX, COVER_MIME, type ArticleServeur,
} from '../blogDraft';

// ============================================================
// LOT BLOG 9 -- LES DECISIONS DE L'EDITEUR.
//
// La page est un composant 'use client' de plusieurs centaines de lignes :
// elle n'est pas testable utilement, mais TOUT CE QU'ELLE DECIDE l'est --
// c'est pourquoi la logique en a ete extraite. Meme partage que
// `ProductManager` / `productDraft.ts`.
// ============================================================

const SERVEUR: ArticleServeur = {
  id: 'a1', title: 'Nos horaires', slug: 'nos-horaires', excerpt: 'Un extrait.',
  content: 'Le corps.', cover_image: null, published: false,
  published_at: null, updated_at: null,
};

describe('corpsCreation — le navigateur ne fabrique JAMAIS de `site_id`', () => {
  it('porte le SLUG du site sous `site`, et le slug de l’ARTICLE sous `slug`', () => {
    const c = corpsCreation('mon-site', { ...BROUILLON_VIDE, title: 'T', slug: 'mon-article' });
    expect(c.site).toBe('mon-site');
    expect(c.slug).toBe('mon-article');
  });

  it('AUCUN `site_id`, `id`, `published_at` ni `cover_storage_path` n’est émis', () => {
    const c = corpsCreation('mon-site', { title: 'T', slug: 's', excerpt: 'e', content: 'c' });
    for (const interdit of ['site_id', 'id', 'published_at', 'cover_storage_path', 'created_at']) {
      expect(c, interdit).not.toHaveProperty(interdit);
    }
    expect(Object.keys(c).sort()).toEqual(['content', 'excerpt', 'site', 'slug', 'title']);
  });

  it('un slug vide n’est PAS transmis — le serveur le dérive du titre', () => {
    const c = corpsCreation('mon-site', { ...BROUILLON_VIDE, title: 'T', slug: '   ' });
    expect(c).not.toHaveProperty('slug');
  });

  it('le titre est trimé', () => {
    expect(corpsCreation('s', { ...BROUILLON_VIDE, title: '  T  ' }).title).toBe('T');
  });
});

describe('corpsModification — n’envoie QUE ce qui a changé', () => {
  it('rien de modifié -> patch vide', () => {
    expect(corpsModification(SERVEUR, versBrouillon(SERVEUR))).toEqual({});
  });

  it('le slug n’est PAS réécrit quand seul le titre change', () => {
    // Sinon un simple changement de titre casserait l'URL d'un article publié
    // sans que personne ne l'ait demandé.
    const p = corpsModification(SERVEUR, { ...versBrouillon(SERVEUR), title: 'Nouveau titre' });
    expect(p).toEqual({ title: 'Nouveau titre' });
    expect(p).not.toHaveProperty('slug');
  });

  it('un slug vidé n’efface pas le lien existant', () => {
    expect(corpsModification(SERVEUR, { ...versBrouillon(SERVEUR), slug: '' })).toEqual({});
  });

  it('un extrait vidé EST transmis — c’est une intention, pas une omission', () => {
    expect(corpsModification(SERVEUR, { ...versBrouillon(SERVEUR), excerpt: '' })).toEqual({ excerpt: '' });
  });

  it('jamais de `site_id` ni de `published`, quel que soit le brouillon', () => {
    const p = corpsModification(SERVEUR, { title: 'A', slug: 'b', excerpt: 'c', content: 'd' });
    expect(p).not.toHaveProperty('site_id');
    expect(p).not.toHaveProperty('published');
  });
});

describe('versBrouillon — les nuls du serveur deviennent des chaînes', () => {
  it('un extrait nul ne devient pas « null » dans le champ', () => {
    const b = versBrouillon({ ...SERVEUR, excerpt: null as unknown as string });
    expect(b.excerpt).toBe('');
  });
});

describe('peutEnregistrer / peutPublier', () => {
  it('un titre suffit à enregistrer — le serveur dérive le reste', () => {
    expect(peutEnregistrer({ ...BROUILLON_VIDE, title: 'T' })).toBe(true);
    expect(peutEnregistrer({ ...BROUILLON_VIDE, title: '   ' })).toBe(false);
  });

  it('publier exige un CORPS — une page vide ne paraît pas', () => {
    expect(peutPublier({ ...BROUILLON_VIDE, title: 'T' })).toBe(false);
    expect(peutPublier({ ...BROUILLON_VIDE, title: 'T', content: 'x' })).toBe(true);
  });
});

describe('cleErreur — le 404 reste volontairement ambigu', () => {
  const CAS: [number, string][] = [
    [401, 'blog.err.auth'], [403, 'blog.err.auth'], [404, 'blog.err.introuvable'],
    [409, 'blog.err.slugPris'], [400, 'blog.err.invalide'], [429, 'blog.err.trop'],
    [502, 'blog.err.indispo'], [503, 'blog.err.indispo'], [500, 'blog.err.generique'],
  ];
  for (const [statut, cle] of CAS) {
    it(`${statut} -> ${cle}`, () => expect(cleErreur(statut)).toBe(cle));
  }

  it('l’interface ne tente PAS de distinguer « inexistant » de « pas à vous »', () => {
    // Le serveur rend le même 404 pour les deux : prétendre les séparer côté
    // client fabriquerait une information que la réponse ne contient pas.
    expect(cleErreur(404)).toBe('blog.err.introuvable');
  });
});

describe('refusCouverture — bornes alignées sur la route ET sur le bucket', () => {
  it('les bornes sont celles du bucket réel', () => {
    expect(COVER_TAILLE_MAX).toBe(5 * 1024 * 1024);
    expect(COVER_MIME).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
  });

  it('SVG refusé côté client comme côté serveur', () => {
    expect(refusCouverture({ size: 1, type: 'image/svg+xml' })).toBe('blog.err.invalide');
  });

  it('au-delà de 5 Mo -> refusé sans aller-retour', () => {
    expect(refusCouverture({ size: COVER_TAILLE_MAX + 1, type: 'image/png' })).toBe('blog.err.invalide');
  });

  it('exactement 5 Mo, type valide -> accepté', () => {
    expect(refusCouverture({ size: COVER_TAILLE_MAX, type: 'image/png' })).toBeNull();
  });
});

describe('cliquet structurel — la page', () => {
  const PAGE = readFileSync(join(__dirname, '..', 'page.tsx'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const DRAFT = readFileSync(join(__dirname, '..', 'blogDraft.ts'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('la page ne fabrique AUCUN `site_id`', () => {
    expect(PAGE).not.toMatch(/site_id/);
    expect(DRAFT).not.toMatch(/site_id/);
  });

  it('la page ne lit ni n’écrit JAMAIS `site_blog_posts` en direct', () => {
    // La table n'accorde rien à `authenticated` : tout passe par les routes.
    expect(PAGE).not.toMatch(/site_blog_posts|blog_posts|supabaseAdmin/);
  });

  it('toutes les écritures passent par `/api/blog/posts`', () => {
    for (const chemin of ['/api/blog/posts', '/api/blog/posts/generate']) {
      expect(PAGE, chemin).toContain(chemin);
    }
  });

  it('le jeton d’accès accompagne CHAQUE appel — un seul point de passage', () => {
    expect(PAGE).toMatch(/Authorization: `Bearer \$\{tk\}`/);
    // `fetch(` n'apparaît qu'une fois : dans `appeler`. Aucun appel ne peut
    // donc contourner l'ajout du jeton ni le traitement d'erreur.
    expect((PAGE.match(/\bfetch\(/g) ?? []).length).toBe(1);
  });

  it('aucun message d’erreur brut du serveur n’est affiché', () => {
    // Les messages viennent du dictionnaire via `cleErreur`, jamais du corps
    // de la réponse — qui pourrait porter un texte technique.
    expect(PAGE).toContain('setErreur(t(cleErreur(res.status)))');
    // Seules deux formes sont admises : un message du dictionnaire, ou la
    // remise à zéro. Jamais un texte venu du corps de la réponse.
    expect(PAGE).not.toMatch(/setErreur\((?!t\(|''\))/);
  });

  it('la logique de décision vit dans `blogDraft`, pas dans le JSX', () => {
    for (const f of ['corpsCreation', 'corpsModification', 'peutPublier', 'cleErreur', 'refusCouverture']) {
      expect(PAGE, f).toContain(f);
    }
  });
});
