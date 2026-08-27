import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';

// ============================================================
// DEBT-081 -- `server-only` NE DOIT PLUS ENTRER DANS LE GRAPHE CLIENT.
//
// CE QUI EST ARRIVE. `f5f17ec` a fait verifier l'eligibilite fournisseur a la
// LECTURE -- un correctif juste -- en important `selectionServable` dans
// `themes/shared.tsx`. Or ce fichier est BI-ENVIRONNEMENT : quatre composants
// 'use client' l'importent. `catalogAdmission` portait `import 'server-only'`,
// qui est donc entre dans un bundle client, et `next build` a echoue avec
// quatre erreurs -- pendant 22 commits, sans que rien ne le signale.
//
// `tsc` NE PEUT PAS LE VOIR : `server-only` est une contrainte de BUNDLER, pas
// de types. La suite de tests non plus : `vitest.config.ts` remplace
// `server-only` par un stub inerte. Seul `next build` le detectait -- et un
// build casse ne dit pas QUI l'a casse.
//
// CE CLIQUET LE DIT. Il part de chaque fichier 'use client', suit les imports
// relatifs et alias, et echoue en nommant le CHEMIN exact par lequel une
// autorite `server-only` est atteinte.
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

const TOUS = fichiers(SRC).filter((f) => !f.includes('__tests__'));
const rel = (f: string) => f.slice(SRC.length + 1);
const lire = (f: string) => readFileSync(f, 'utf-8');

/** Resout un specificateur d'import vers un fichier reel de `src/`. */
function resoudre(depuis: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(depuis), spec);
  else return null; // paquet npm : hors du graphe de `src/`
  for (const suffixe of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
    const c = base + suffixe;
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const IMPORTS = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;

function importes(f: string): string[] {
  const src = lire(f);
  const out: string[] = [];
  for (const m of src.matchAll(IMPORTS)) {
    const cible = resoudre(f, m[1]);
    if (cible) out.push(cible);
  }
  return out;
}

const porteServerOnly = (f: string) => /^\s*import\s+['"]server-only['"]/m.test(lire(f));

/** Point d'entree client : un fichier 'use client'. */
const CLIENTS = TOUS.filter((f) => /^\s*['"]use client['"]/m.test(lire(f)));

/** Remonte le premier chemin depuis un client vers une autorite server-only. */
function cheminFautif(): string | null {
  const vus = new Set<string>();
  const pile: { f: string; via: string[] }[] = CLIENTS.map((f) => ({ f, via: [rel(f)] }));
  while (pile.length) {
    const { f, via } = pile.pop()!;
    if (vus.has(f)) continue;
    vus.add(f);
    if (porteServerOnly(f)) return via.join('\n    -> ');
    for (const suivant of importes(f)) {
      if (!vus.has(suivant)) pile.push({ f: suivant, via: [...via, rel(suivant)] });
    }
  }
  return null;
}

describe('DEBT-081 — le graphe client ne touche aucune autorité `server-only`', () => {
  it('le dénominateur est réel : des composants client existent et sont suivis', () => {
    expect(CLIENTS.length).toBeGreaterThan(10);
    // Le résolveur fonctionne : `shared.tsx` a bien des imports résolus.
    const shared = join(SRC, 'app', 'sites', '[slug]', 'themes', 'shared.tsx');
    expect(existsSync(shared)).toBe(true);
    expect(importes(shared).length).toBeGreaterThan(1);
  });

  it('le détecteur voit réellement un `server-only` quand il y en a un', () => {
    // Contrôle du contrôle : sans lui, un faux négatif rendrait ce test vert
    // pour de mauvaises raisons.
    const admin = join(SRC, 'lib', 'supabase-admin.ts');
    expect(porteServerOnly(admin), 'supabase-admin.ts doit porter server-only').toBe(true);
  });

  it('AUCUN chemin ne mène d’un composant client à un module `server-only`', () => {
    const chemin = cheminFautif();
    expect(
      chemin,
      chemin
        ? `\`server-only\` atteint depuis un composant client :\n    ${chemin}\n\n` +
          `\`next build\` échouera. Soit le module intermédiaire est PUR et ne doit pas porter ` +
          `\`server-only\` (cas de \`dropship/catalogAdmission\`, DEBT-081), soit le composant ` +
          `client ne doit pas l'importer.`
        : undefined
    ).toBeNull();
  });
});
