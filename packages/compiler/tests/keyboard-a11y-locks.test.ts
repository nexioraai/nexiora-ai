// VERROUS MÉCANIQUES PERMANENTS — DET-016 (clavier) + non-régression DET-006.
// Grille A++ dimension A étendue (D-039) : « aucun champ actif ni contrôle
// nécessaire au parcours masqué par le clavier système ».
// Ces tests ne prouvent PAS l'expérience réelle — seule l'observation sur
// appareil le peut. Ils prouvent que le MÉCANISME est présent partout et
// qu'aucune régression structurelle ne peut se glisser.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileProject } from "../src/compile-project.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, "..", "..", "golden-corpus", "corpus-v2");
const DOCS = readdirSync(CORPUS).filter((f) => f.endsWith(".air.json"));
const KB = "automaticallyAdjustKeyboardInsets";

interface Air {
  screens: { id: string; blocks: { blockType: string }[] }[];
}
const load = (f: string): Air =>
  JSON.parse(readFileSync(join(CORPUS, f), "utf8")) as Air;

// Retire commentaires de ligne et de bloc : un mot dans un commentaire n'est
// pas du code (leçon d'une sonde antérieure qui avait produit un faux positif).
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const compiled = DOCS.map((f) => ({ f, air: load(f), out: compileProject(load(f) as never) }));

const screensOf = (c: (typeof compiled)[number]) =>
  c.air.screens.map((s) => ({
    screen: s,
    path: [...c.out.files.keys()].find((k) => k.endsWith(`screens/${s.id}.tsx`)),
  }));

describe("DET-016 — verrous clavier (7 propriétés mécaniques)", () => {
  it("1. tout ScrollView émis porte l'ajustement clavier", () => {
    const bad: string[] = [];
    for (const c of compiled) {
      for (const { path } of screensOf(c)) {
        if (path === undefined) continue;
        const code = String(c.out.files.get(path));
        if (code.includes("<ScrollView") && !code.includes(KB)) bad.push(`${c.f}:${path}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("2. la FlatList du bloc list porte l'ajustement + persistTaps", () => {
    const src = readFileSync(join(HERE, "..", "..", "blocks", "src", "components.tsx"), "utf8");
    const code = stripComments(src);
    expect(code).toContain(KB);
    expect(code).toContain('keyboardShouldPersistTaps="handled"');
  });

  it("3. tout manifeste Android déclare le redimensionnement clavier", () => {
    const bad: string[] = [];
    for (const c of compiled) {
      const p = [...c.out.files.keys()].find((k) => k.endsWith("app.json"));
      if (p === undefined) { bad.push(`${c.f}:app.json absent`); continue; }
      const m = JSON.parse(String(c.out.files.get(p))) as {
        expo?: { android?: { softwareKeyboardLayoutMode?: string } };
      };
      if (m.expo?.android?.softwareKeyboardLayoutMode !== "resize") bad.push(c.f);
    }
    expect(bad).toEqual([]);
  });

  it("4. AUCUN Platform.OS réel dans le code émis (hors commentaires)", () => {
    const bad: string[] = [];
    for (const c of compiled) {
      for (const [path, content] of c.out.files) {
        if (!/\.tsx?$/.test(path)) continue;
        if (stripComments(content).includes('Platform.OS')) bad.push(`${c.f}:${path}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("5. AUCUN écran porteur d'un bloc form n'échappe au traitement", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const c of compiled) {
      for (const { screen, path } of screensOf(c)) {
        if (path === undefined) continue;
        if (!screen.blocks.some((b) => b.blockType === "form")) continue;
        seen += 1;
        const code = String(c.out.files.get(path));
        const hasList = screen.blocks.some((b) => b.blockType === "list");
        // écran sans liste : le ScrollView émis porte le mécanisme ;
        // écran avec liste : la FlatList du bloc le porte (test 2).
        if (!hasList && !code.includes(KB)) bad.push(`${c.f}:${screen.id}`);
      }
    }
    expect(bad).toEqual([]);
    expect(seen).toBeGreaterThanOrEqual(13);
  });

  it("6bis. DET-025 : la liste reçoit un parent BORNÉ dans l'ARTEFACT ÉMIS", () => {
    // Le contrôle 6 vérifiait seulement l'ABSENCE de ScrollView. C'était
    // insuffisant : la liste peut n'être dans aucun défileur ET n'avoir
    // aucun parent borné — c'est exactement l'état qui a produit, sur
    // appareil, une dernière ligne coupée et un bloc suivant hors écran.
    // Ce contrôle regarde donc les DEUX moitiés de la chaîne, telles
    // qu'elles partent dans le projet généré.
    for (const c of compiled) {
      const blocs = stripComments(String(c.out.files.get("lib/blocks/components.tsx")));
      const prims = stripComments(String(c.out.files.get("lib/primitives/primitives.tsx")));
      // moitié 1 — le bloc DEMANDE le bornage
      expect(blocs, `${c.f}: ListBlock doit demander fill`).toMatch(/<Section[^>]*\sfill\b/);
      // moitié 2 — la primitive l'APPLIQUE réellement à un style
      expect(prims, `${c.f}: Section doit consommer fill`).toMatch(/fill\s*\?/);
      expect(prims, `${c.f}: Section doit appliquer sectionFill`).toContain("s.sectionFill");
    }
  });

  it("6. NON-RÉGRESSION DET-006 : aucune liste dans un ScrollView de même axe", () => {
    const bad: string[] = [];
    for (const c of compiled) {
      for (const { screen, path } of screensOf(c)) {
        if (path === undefined) continue;
        if (!screen.blocks.some((b) => b.blockType === "list")) continue;
        if (String(c.out.files.get(path)).includes("ScrollView")) bad.push(`${c.f}:${screen.id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("7. déterminisme préservé sur tout le corpus", () => {
    for (const c of compiled) {
      expect(compileProject(c.air as never).rootHash).toBe(c.out.rootHash);
    }
  });
});
