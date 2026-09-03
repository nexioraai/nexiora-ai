import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

// ============================================================
// DEBT-078 -- LE RATTACHEMENT DES TABLES `marketing_*` AUX SITES.
//
// `marketing_assets` et `marketing_briefs` sont rattachees a `sites` par
// `slug` -- de VRAIES cles etrangeres vers `sites.slug`, pas des colonnes
// libres. Un slug est un identifiant d'ADRESSAGE : il ne porte ni integrite
// vers l'identite du site, ni cascade, ni immutabilite. C'est le meme motif
// que `site_blog_posts.sql` refuse explicitement dans son en-tete.
//
// LA MIGRATION EST PREPAREE, PAS EXECUTEE :
//   supabase/sql/marketing_site_id_step1_add_column_backfill_and_fk.sql
//   supabase/sql/marketing_site_id_step2_not_null.sql
// Le DDL est indisponible depuis l'environnement de developpement (DEBT-004,
// DEBT-046, DEBT-072). Ce cliquet ne peut donc RIEN prouver de la base -- il
// ne pretend pas le contraire.
//
// CE QU'IL TIENT, ET QUI EST REELLEMENT TENABLE PAR UN TEST :
//   1. la POPULATION des consommateurs -- un troisieme ecrivain ne peut pas
//      apparaitre en silence sur des tables dont le rattachement est en
//      cours de migration ;
//   2. la FRONTIERE -- ces tables ne sont jamais atteintes depuis le
//      navigateur, ce qui est la raison pour laquelle le rattachement par
//      slug reste tolerable en attendant ;
//   3. `slug` reste ECRIT tant qu'il est `NOT NULL` en base -- le piege
//      exact de la migration : basculer le code sur `site_id` en RETIRANT
//      `slug` ferait echouer chaque ecriture, silencieusement (les deux
//      ecritures sont enrobees d'un `try/catch` qui journalise et continue) ;
//   4. les deux fichiers SQL restent ADDITIFS et fail-closed, et l'ordre
//      d'application imperatif de l'etape 2 ne peut pas disparaitre du
//      fichier -- meme raisonnement que `staleSqlObsolescence` : un test ne
//      peut pas empecher l'execution d'un SQL, il peut empecher son
//      AVERTISSEMENT de s'effacer.
// ============================================================

const SRC = join(__dirname, '..', '..', '..');
const SQL_DIR = join(SRC, '..', 'supabase', 'sql');

const STEP1 = 'marketing_site_id_step1_add_column_backfill_and_fk.sql';
const STEP2 = 'marketing_site_id_step2_not_null.sql';

/** Les deux seuls consommateurs legitimes, chemins relatifs a `src/`. */
const CONSOMMATEURS = [
  join('app', 'api', 'blog', 'posts', 'generate', 'route.ts'),
  join('app', 'api', 'marketing', 'generate', 'route.ts'),
];

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

/** Commentaires retires : une table citee dans une explication n'est pas un
 *  acces. `api/blog/generate/route.ts` en nomme une pour dire qu'il ne la
 *  touche PAS -- le compter serait un faux positif. */
const code = (f: string) =>
  readFileSync(f, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const sql = (f: string) => readFileSync(join(SQL_DIR, f), 'utf-8');
/** Sur du SQL, les commentaires `--` portent les avertissements : on ne les
 *  retire que pour juger des INSTRUCTIONS. */
const sqlInstructions = (f: string) =>
  sql(f)
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

const TABLES = /marketing_(assets|briefs)/;

describe('DEBT-078 — le dénominateur est réel', () => {
  it('le balayage voit bien tout `src/`, et les deux consommateurs existent', () => {
    expect(PRODUCTION.length).toBeGreaterThan(200);
    for (const c of CONSOMMATEURS) {
      expect(existsSync(join(SRC, c)), c).toBe(true);
      expect(TABLES.test(code(join(SRC, c))), c).toBe(true);
    }
  });

  it('les deux fichiers de migration sont versionnés', () => {
    for (const f of [STEP1, STEP2]) {
      expect(existsSync(join(SQL_DIR, f)), f).toBe(true);
    }
  });
});

describe('DEBT-078 — la population des consommateurs est close', () => {
  it('EXACTEMENT deux fichiers de production nomment `marketing_assets` / `marketing_briefs`', () => {
    const porteurs = PRODUCTION.filter((f) => TABLES.test(code(f))).map(rel).sort();
    expect(
      porteurs,
      'Un consommateur est apparu sur des tables dont le rattachement est en cours de migration ' +
        '(DEBT-078). Tout nouvel accès doit écrire `site_id`, pas seulement `slug` — sans quoi il ' +
        'rouvre le défaut que la migration ferme. Voir supabase/sql/' +
        STEP1
    ).toEqual([...CONSOMMATEURS].sort());
  });

  it('aucun accès ne passe par le client navigateur — `supabaseAdmin`, et rien d’autre', () => {
    for (const c of CONSOMMATEURS) {
      const s = code(join(SRC, c));
      // Chaque `.from('marketing_*')` doit être porté par `supabaseAdmin`.
      // Le client anon n'a de toute façon plus les privilèges d'écriture
      // (phase2_privileges_hardening.sql), mais la lecture doit rester
      // serveur elle aussi : le brief d'un site est une donnée de locataire.
      expect(s, c).toMatch(/supabaseAdmin/);
      // `supabaseAdmin` contient `supabase` : la frontiere de mot `\b` seule
      // ne suffirait pas. On exige donc qu'aucun `.from('marketing_*)` ne
      // soit precede d'un identifiant qui ne soit pas `supabaseAdmin`.
      const accesAnon = /(?<!Admin)\bsupabase\s*\n?\s*\.from\('marketing_/.test(s);
      expect(accesAnon, `${c} atteint une table marketing avec le client anon`).toBe(false);
    }
  });
});

describe('DEBT-078 — `slug` reste écrit tant qu’il est NOT NULL en base', () => {
  // Le piège de la migration : `marketing_*.slug` est `NOT NULL`. Basculer le
  // code sur `site_id` en RETIRANT `slug` du payload ferait échouer chaque
  // écriture — et les deux sont enrobées d'un `try/catch` qui journalise sans
  // relever. La panne serait totale et invisible.
  it('les deux écritures de `api/marketing/generate` portent toujours `slug`', () => {
    const s = code(join(SRC, 'app', 'api', 'marketing', 'generate', 'route.ts'));

    const upsert = s.slice(s.indexOf(".from('marketing_briefs')"));
    const iUpsert = upsert.indexOf('.upsert(');
    expect(iUpsert, 'l’upsert du cache brief a disparu').toBeGreaterThan(-1);
    expect(upsert.slice(iUpsert, iUpsert + 200)).toMatch(/\bslug\b/);

    const insert = s.slice(s.indexOf(".from('marketing_assets')"));
    const iInsert = insert.indexOf('.insert(');
    expect(iInsert, 'l’insert d’asset a disparu').toBeGreaterThan(-1);
    expect(insert.slice(iInsert, iInsert + 200)).toMatch(/\bslug\b/);
  });
});

describe('DEBT-078 — les deux migrations restent additives et fail-closed', () => {
  const DESTRUCTIF = [
    /drop\s+table/i,
    /drop\s+column/i,
    /drop\s+constraint/i,
    /truncate/i,
    /delete\s+from/i,
  ];

  for (const f of [STEP1, STEP2]) {
    it(`${f} — aucune instruction destructive`, () => {
      const s = sqlInstructions(f);
      const trouves = DESTRUCTIF.filter((r) => r.test(s)).map((r) => String(r));
      expect(
        trouves,
        `${f} est devenu destructif. Ce chantier ne supprime RIEN : ni \`slug\`, ni sa FK vers ` +
          `sites.slug, ni \`owner_email\`, ni une ligne. \`slug\` reste la CLÉ DE CACHE de ` +
          `marketing_briefs, lue par deux routes.`
      ).toEqual([]);
    });

    it(`${f} — porte une barrière \`raise exception\``, () => {
      expect(sqlInstructions(f)).toMatch(/raise\s+exception/i);
    });
  }

  it(`${STEP1} — pose la FK vers \`sites(id)\` et laisse la colonne NULLABLE`, () => {
    const s = sqlInstructions(STEP1);
    expect(s).toMatch(/references\s+public\.sites\s*\(\s*id\s*\)/i);
    expect(s).toMatch(/add\s+column\s+if\s+not\s+exists\s+site_id\s+uuid/i);
    // `SET NOT NULL` en étape 1 casserait la production : le code déployé
    // n'écrit pas encore `site_id`. C'est l'étape 2, et elle seule.
    expect(
      /set\s+not\s+null/i.test(s),
      `${STEP1} pose \`SET NOT NULL\` — c'est le piège exact de la séquence expand/contract : ` +
        `le code déployé n'écrit pas encore \`site_id\`, chaque écriture marketing échouerait, ` +
        `et silencieusement. Ce verrou appartient à ${STEP2}.`
    ).toBe(false);
  });

  it(`${STEP2} — pose \`SET NOT NULL\` et porte son ordre d’application impératif`, () => {
    expect(sqlInstructions(STEP2)).toMatch(/set\s+not\s+null/i);
    // L'avertissement vit dans les commentaires : on lit le fichier ENTIER.
    const brut = sql(STEP2);
    expect(brut).toMatch(/NE PAS EXECUTER/i);
    expect(brut).toContain('src/app/api/marketing/generate/route.ts');
  });
});
