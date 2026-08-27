import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// ============================================================
// DETTE 6a — CLIQUET D'IDENTITÉ.
//
// `sites.owner_email` est écrite UNE SEULE FOIS, à la création du site
// (api/chat/route.ts), et AUCUN update ne la touche jamais. Un propriétaire
// qui change d'adresse laisse donc la colonne figée sur l'ancienne : toute
// route qui s'en sert comme IDENTITÉ accorde le site à quiconque obtient
// ensuite cette adresse, et le refuse à son propriétaire réel.
//
// La dette 6a a corrigé `/chat` et `/apply`. L'extension a corrigé sept
// occurrences de plus, réparties sur DEUX idiomes qu'un seul grep ne voyait
// pas ensemble :
//     .eq('owner_email', ...)          — filtre PostgREST
//     site.owner_email !== user.email  — comparaison JavaScript
// Ce cliquet surveille LES DEUX, sur l'ensemble des routes corrigées.
//
// CE QU'IL N'INTERDIT PAS : `owner_email` comme DONNÉE (métadonnée Stripe,
// colonne historique de marketing_briefs/marketing_assets, affichage admin).
// Seul son usage comme clé d'identité est proscrit.
// ============================================================

const API = join(__dirname, '../../app/api');

/** Source privée de commentaires : la prose explique le défaut, elle ne le porte pas. */
function code(file: string): string {
  return readFileSync(file, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function routes(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === '__tests__') continue;
      out.push(...routes(p));
    } else if (e === 'route.ts') {
      out.push(p);
    }
  }
  return out;
}

/** Les huit occurrences de l'extension, plus les deux de la dette 6a d'origine. */
const CORRIGEES = [
  'checkout/route.ts',
  'sites/[slug]/route.ts',
  'marketing/generate/route.ts',
  'domains/route.ts',
  'domains/purchase/route.ts',
  'domains/status/route.ts',
  'domains/provision/route.ts',
  'agent/[slug]/chat/route.ts',
  'agent/[slug]/apply/route.ts',
];

const FILTRE_EMAIL = /\.eq\(\s*['"]owner_email['"]/;
const COMPARAISON_EMAIL = /owner_email\s*!==|owner_email\s*===/;

describe('DETTE 6a — `owner_email` n’est plus une clé d’identité', () => {
  for (const rel of CORRIGEES) {
    it(`${rel} : aucun filtre \`.eq('owner_email')\``, () => {
      expect(code(join(API, rel)), rel).not.toMatch(FILTRE_EMAIL);
    });

    it(`${rel} : aucune comparaison \`owner_email !==\` / \`===\``, () => {
      expect(code(join(API, rel)), rel).not.toMatch(COMPARAISON_EMAIL);
    });

    it(`${rel} : la propriété passe par la primitive canonique`, () => {
      expect(code(join(API, rel)), rel).toMatch(/requireSiteOwner|requireProductOwner/);
    });
  }

  it('aucune de ces routes ne réimplémente la règle de priorité `owner_id`', () => {
    // La primitive est la SEULE autorité. Une copie inline divergerait au
    // premier changement — c'est précisément ce que M2-02 a servi à défaire.
    for (const rel of CORRIGEES) {
      const s = code(join(API, rel));
      expect(s, rel).not.toMatch(/owner_id\s*!=\s*null\s*\?/);
      expect(s, rel).not.toMatch(/owner_id\s*===\s*user\.id/);
    }
  });
});

describe('DETTE 6a — les écritures visent la ligne déjà autorisée', () => {
  // Filtrer une écriture sur `owner_id` casserait le repli de la primitive :
  // PostgREST traduit `.eq(col, null)` en `col=eq.null`, qui n'apparie AUCUNE
  // ligne NULL. L'ancrage se fait donc sur l'identifiant de la ligne.
  for (const rel of ['checkout/route.ts', 'sites/[slug]/route.ts']) {
    it(`${rel} : l’UPDATE est ancré sur \`id\`, jamais sur \`owner_id\``, () => {
      const s = code(join(API, rel));
      expect(s, rel).toMatch(/\.eq\('id', site\.id\)/);
      expect(s, rel).not.toMatch(/\.eq\(\s*['"]owner_id['"]/);
    });
  }
});

describe('DETTE 6a — le périmètre restant est connu et délibéré', () => {
  it('les routes qui portent encore `owner_email` sont EXACTEMENT celles attendues', () => {
    // Aucune de ces cinq ne s'en sert comme identité :
    //   admin/*   -> donnée d'AFFICHAGE, réservée à l'opérateur ;
    //   chat      -> ÉCRITURE initiale de la colonne (sa seule source) ;
    //   checkout  -> métadonnée Stripe, issue du JETON et non de la colonne ;
    //   marketing -> colonne historique de marketing_briefs/assets, transportée.
    // Toute entrée nouvelle dans cette liste doit être justifiée de la même
    // façon : ce test la rend impossible à ajouter en silence.
    const ATTENDUES = [
      'admin/ai-usage/route.ts',
      'admin/stats/route.ts',
      'chat/route.ts',
      'checkout/route.ts',
      'marketing/generate/route.ts',
    ];
    const porteuses = routes(API)
      .filter((f) => /owner_email/.test(code(f)))
      .map((f) => f.slice(API.length + 1))
      .sort();
    expect(porteuses).toEqual(ATTENDUES.sort());
  });

  it('AUCUNE route de `src/app/api/` n’utilise plus l’un ou l’autre idiome d’identité', () => {
    const coupables = routes(API)
      .filter((f) => FILTRE_EMAIL.test(code(f)) || COMPARAISON_EMAIL.test(code(f)))
      .map((f) => f.slice(API.length + 1));
    expect(coupables, 'owner_email est redevenu une clé d’identité').toEqual([]);
  });
});
