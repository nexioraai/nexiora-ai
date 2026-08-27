import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// ============================================================
// LOT BLOG 10 -- LES FRONTIERES DU BLOG, VERIFIEES SUR TOUT `src/`.
//
// Les lots 1 a 9 ont chacun pose leurs gardes DANS leur fichier. Elles y
// prouvent qu'un fichier donne se comporte bien -- elles ne peuvent rien dire
// d'un fichier qui n'existe pas encore. Ce cliquet-ci raisonne sur la
// POPULATION : il balaye `src/` en entier et repond a des questions qu'aucun
// test local ne peut poser.
//
// C'est la difference entre « cette route est correcte » et « aucune route ne
// peut etre incorrecte ». Le second seul survit a un ajout.
// ============================================================

const SRC = join(__dirname, '..', '..', '..');

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) fichiers(f, acc);
    else if (/\.tsx?$/.test(e)) acc.push(f);
  }
  return acc;
}

const TOUS = fichiers(SRC);
const PRODUCTION = TOUS.filter((f) => !f.includes('__tests__'));
const rel = (f: string) => f.slice(SRC.length + 1);
const code = (f: string) =>
  readFileSync(f, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Tout ce qui constitue la surface Blog des sites clients. */
const SURFACE_BLOG = PRODUCTION.filter((f) => {
  const r = rel(f);
  return (
    r.startsWith(join('app', 'api', 'blog', 'posts')) ||
    r.startsWith(join('app', 'sites', '[slug]', 'blog')) ||
    r.startsWith(join('app', 'dashboard', 'blog')) ||
    r === join('lib', 'blog.ts') ||
    r === join('lib', 'auth', 'require-article-owner.ts')
  );
});

describe('le dénominateur est réel', () => {
  it('le balayage voit bien tout `src/` et la surface Blog', () => {
    expect(PRODUCTION.length).toBeGreaterThan(200);
    expect(SURFACE_BLOG.length).toBeGreaterThanOrEqual(10);
  });
});

describe('LOT BLOG 10 — un seul module touche la table', () => {
  it('`site_blog_posts` n’est nommée QUE dans `lib/blog.ts`', () => {
    const porteurs = PRODUCTION.filter((f) => /['"]site_blog_posts['"]/.test(code(f))).map(rel);
    expect(porteurs).toEqual([join('lib', 'blog.ts')]);
  });

  it('la VUE publique n’est lue que par le module de lecture publique', () => {
    const porteurs = PRODUCTION.filter((f) => /site_blog_posts_public/.test(code(f))).map(rel);
    expect(porteurs).toEqual([join('app', 'sites', '[slug]', 'blog', 'fetchPosts.ts')]);
  });

  it('AUCUN fichier du blog ne confond `site_blog_posts` avec `blog_posts` (plateforme)', () => {
    // `blog_posts` n'a AUCUNE colonne de site et sa lecture est accordée à
    // `anon` : l'y brancher ferait s'effondrer toute la chaîne de propriété.
    for (const f of SURFACE_BLOG) {
      expect(code(f), rel(f)).not.toMatch(/['"]blog_posts['"]/);
    }
  });
});

describe('LOT BLOG 10 — `site_id` ne vient jamais du client', () => {
  it('aucune route du blog ne lit `site_id` d’un corps ou d’une URL', () => {
    const routes = SURFACE_BLOG.filter((f) => rel(f).startsWith(join('app', 'api', 'blog')));
    expect(routes.length).toBeGreaterThanOrEqual(3);
    for (const f of routes) {
      const c = code(f);
      expect(c, rel(f)).not.toMatch(/searchParams\.get\(\s*['"]site_id/);
      expect(c, rel(f)).not.toMatch(/body[\s\S]{0,40}\.site_id/);
      expect(c, rel(f)).not.toMatch(/formData[\s\S]{0,40}site_id/);
    }
  });

  it('l’interface propriétaire n’en fabrique aucun non plus', () => {
    for (const f of SURFACE_BLOG.filter((x) => rel(x).startsWith(join('app', 'dashboard')))) {
      expect(code(f), rel(f)).not.toMatch(/site_id/);
    }
  });
});

describe('LOT BLOG 10 — la propriété a UNE seule autorité', () => {
  it('toute route d’écriture du blog passe par une primitive canonique', () => {
    const routes = SURFACE_BLOG.filter((f) => rel(f).endsWith(join('route.ts')));
    for (const f of routes) {
      const c = code(f);
      const verbes = c.match(/export async function (POST|PATCH|DELETE|GET)/g) ?? [];
      expect(verbes.length, rel(f)).toBeGreaterThan(0);
      expect(c, rel(f)).toMatch(/requireSiteOwner|requireArticleOwner/);
    }
  });

  it('AUCUNE surface SERVEUR du blog ne réimplémente la règle de propriété', () => {
    // Le tableau de bord est exclu à dessein : il lit la session pour savoir
    // QUI est connecté et lister ses sites — exactement ce que fait déjà
    // `dashboard/marketing`. Il n'AUTORISE rien : toute écriture part vers une
    // route qui, elle, tranche. C'est l'assertion suivante qui le vérifie.
    const serveur = SURFACE_BLOG.filter((f) => !rel(f).startsWith(join('app', 'dashboard')));
    expect(serveur.length).toBeGreaterThanOrEqual(8);
    for (const f of serveur) {
      expect(code(f), rel(f)).not.toMatch(/owner_id\s*===|owner_email\s*===|auth\.getUser\(/);
    }
  });

  it('le tableau de bord n’autorise RIEN lui-même : il porte un jeton, il ne juge pas', () => {
    const page = code(join(SRC, 'app', 'dashboard', 'blog', 'page.tsx'));
    // Aucune décision d'appartenance côté client...
    expect(page).not.toMatch(/owner_id|site_id/);
    // ...et un seul point de sortie, qui joint toujours le jeton.
    expect((page.match(/\bfetch\(/g) ?? []).length).toBe(1);
    expect(page).toMatch(/Authorization: `Bearer/);
  });

  it('il n’existe PAS de seconde primitive d’ownership d’article', () => {
    const primitives = PRODUCTION.filter((f) => /export async function require\w*(Article|Post)\w*Owner/.test(code(f))).map(rel);
    expect(primitives).toEqual([join('lib', 'auth', 'require-article-owner.ts')]);
  });
});

describe('LOT BLOG 10 — le blog est commun aux trois modes', () => {
  it('`canTransact` n’apparaît NULLE PART dans la surface Blog', () => {
    // Une garde d'admission commerciale sur une capacité de CONTENU
    // inventerait une limitation que le produit ne porte pas.
    for (const f of SURFACE_BLOG) {
      expect(code(f), rel(f)).not.toMatch(/canTransact|commerce-admission/);
    }
  });

  it('aucune garde « site publié » ne s’est glissée dans les routes du blog', () => {
    for (const f of SURFACE_BLOG.filter((x) => rel(x).startsWith(join('app', 'api', 'blog')))) {
      expect(code(f), rel(f)).not.toMatch(/published !== true|Publiez un site/);
    }
  });
});

describe('LOT BLOG 10 — la surface publique ne peut pas fuir', () => {
  const PUBLIQUE = SURFACE_BLOG.filter((f) => rel(f).startsWith(join('app', 'sites')));

  it('elle est bien identifiée', () => {
    expect(PUBLIQUE.length).toBeGreaterThanOrEqual(4);
  });

  it('AUCUN `supabaseAdmin` : la clé anon, et rien d’autre', () => {
    for (const f of PUBLIQUE) expect(code(f), rel(f)).not.toMatch(/supabaseAdmin|SERVICE_ROLE/);
  });

  it('AUCUN `revalidate` : un cache partagé entre locataires', () => {
    for (const f of PUBLIQUE) expect(code(f), rel(f)).not.toMatch(/export\s+const\s+revalidate/);
  });

  it('AUCUN `dangerouslySetInnerHTML` : la CSP n’opposerait rien', () => {
    for (const f of PUBLIQUE) expect(code(f), rel(f)).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it('la visibilité n’est jamais réécrite — elle vit dans la vue', () => {
    for (const f of PUBLIQUE) expect(code(f), rel(f)).not.toMatch(/archived_at|\.eq\(['"]published['"]/);
  });
});

describe('LOT BLOG 10 — le moteur de prompts n’est pas dupliqué', () => {
  it('chaque prompt marketing n’existe QU’À un seul endroit', () => {
    for (const empreinte of ['Tu es un stratège marketing senior', 'Tu es un copywriter premium']) {
      const porteurs = PRODUCTION.filter((f) => readFileSync(f, 'utf-8').includes(empreinte)).map(rel);
      expect(porteurs, empreinte).toEqual([join('lib', 'marketing', 'prompts.ts')]);
    }
  });
});

describe('LOT BLOG 10 — chaque route du blog est documentée', () => {
  it('les cinq chemins figurent dans `docs/API.md`', () => {
    const doc = readFileSync(join(SRC, '..', 'docs', 'API.md'), 'utf-8');
    const routes = PRODUCTION
      .filter((f) => rel(f).startsWith(join('app', 'api', 'blog', 'posts')) && rel(f).endsWith('route.ts'))
      .map((f) => '/api/' + rel(f).slice(join('app', 'api').length + 1).replace(/[\\/]route\.ts$/, '').replace(/\\/g, '/'));
    expect(routes.length).toBe(4);
    for (const r of routes) expect(doc, r).toContain('`' + r + '`');
  });
});
