// ORACLE L1 (6.2) — corpus ACTIF v2 12/12 : verdict PASSE sur documents
// valides ; détecte une falsification (l'Oracle ne fait pas confiance au
// générateur). CI SANS RÉSEAU.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileProject } from "@deribfy/compiler";
import { runOracleLevel1 } from "../src/index.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus", "corpus-v2");
const docs = readdirSync(CORPUS).filter((f) => f.endsWith(".air.json")).sort();
const load = (f: string): unknown => JSON.parse(readFileSync(join(CORPUS, f), "utf8"));

// CONTRAT D'EXÉCUTION (Étape 1) — l'Oracle ne se contente plus de vérifier
// que l'artefact est BIEN FORMÉ : il mesure ce qu'il ne FAIT PAS. Ces tests
// prouvent que le contrôle rapporte des faits, et non une formule creuse.
describe("Oracle L1 — contrôle du contrat d'exécution", () => {
  const doc = load("resto-quartier.air.json");
  const verdict = runOracleLevel1(doc, compileProject(doc).rootHash);
  const check = verdict.checks.find((c) => c.name === "contrat_execution");

  it("le contrôle existe et ne fait pas échouer l'Oracle (mode déclaré)", () => {
    expect(check).toBeDefined();
    expect(check?.passed).toBe(true);
    expect(verdict.passed).toBe(true);
  });

  it("le détail NOMME l'écart au lieu de le taire", () => {
    // Avant cet étage, un artefact dont les actions sont inertes produisait
    // un Oracle 7/7 muet. Le détail doit désormais porter les trois nombres
    // qui décrivent l'écart, et le sceau du rapport.
    expect(check?.detail).toContain("écart(s) DÉCLARÉ(S)");
    expect(check?.detail).toMatch(/effets \d+\/\d+/);
    expect(check?.detail).toMatch(/contrôles fantômes \d+\/\d+/);
    expect(check?.detail).toMatch(/sceau [0-9a-f]{16}/);
  });

  it("l'écart est IMPUTÉ, et le moteur y est majoritaire", () => {
    expect(check?.detail).toMatch(/moteur \d+ · contrat \d+ · document \d+/);
  });

  it("le contrôle est DÉTERMINISTE d'un appel à l'autre", () => {
    const again = runOracleLevel1(doc, compileProject(doc).rootHash);
    expect(again.checks.find((c) => c.name === "contrat_execution")?.detail).toBe(check?.detail);
  });
});

describe("Oracle L1 — corpus ACTIF v2", () => {
  for (const file of docs) {
    it(`verdict PASSE : ${file}`, () => {
      const doc = load(file);
      const expected = compileProject(doc).rootHash;
      const v = runOracleLevel1(doc, expected);
      expect(v.passed, JSON.stringify(v.checks.filter((c) => !c.passed))).toBe(true);
      // ÉDITION CONSCIENTE (Phase 9) : deux contrôles s'ajoutent à la
      // liste scellée — la politique AST des Code Slots et l'intégrité des
      // copies (§9 niveau 1 les nommait déjà ; ils n'étaient pas encore
      // implémentables avant l'existence des slots). L'ordre est stable.
      expect(v.checks.map((c) => c.name)).toEqual([
        "validateurs",
        "determinisme",
        "permissions_vs_air",
        "backend_vs_air",
        "slots_politique_ast",
        "copies_integrite",
        // ÉDITION CONSCIENTE (Phase 10, P-007) : l'accessibilité devient un
        // contrôle de CONFORMITÉ de l'Oracle (§22), parce que la v2 laisse
        // chaque app choisir ses couleurs — le seuil doit donc être vérifié
        // sur l'artefact de chaque app, pas une fois sur la source.
        "contraste_wcag",
        // ÉDITION CONSCIENTE (Étape 1, contrat d'exécution) : un 8e contrôle
        // recalcule l'écart entre ce que l'AIR DÉCLARE et ce que le moteur
        // sait EXÉCUTER. Il ne refuse pas encore — durcir en mode `strict`
        // change un critère de sortie et relève d'une décision consignée.
        // Ce qu'il change dès maintenant : un artefact dont les actions sont
        // inertes ne peut plus passer l'Oracle SANS QUE CELA SE VOIE.
        "contrat_execution",
      ]);
    });
  }

  it("détecte un hash attendu FALSIFIÉ (déterminisme échoue)", () => {
    const doc = load("resto-quartier.air.json");
    const v = runOracleLevel1(doc, "0".repeat(64));
    expect(v.passed).toBe(false);
    expect(v.checks.find((c) => c.name === "determinisme")?.passed).toBe(false);
  });

  it("refuse un AIR falsifié (blockType hors registre)", () => {
    const doc = load("resto-quartier.air.json") as { screens: { blocks: { blockType: string }[] }[] };
    const b = doc.screens[0]?.blocks[0];
    if (b === undefined) throw new Error("fixture");
    b.blockType = "hero_carousel";
    const v = runOracleLevel1(doc);
    expect(v.passed).toBe(false);
    expect(v.checks.find((c) => c.name === "validateurs")?.passed).toBe(false);
  });
});
