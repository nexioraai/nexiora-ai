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

describe("Oracle L1 — corpus ACTIF v2", () => {
  for (const file of docs) {
    it(`verdict PASSE : ${file}`, () => {
      const doc = load(file);
      const expected = compileProject(doc).rootHash;
      const v = runOracleLevel1(doc, expected);
      expect(v.passed, JSON.stringify(v.checks.filter((c) => !c.passed))).toBe(true);
      expect(v.checks.map((c) => c.name)).toEqual([
        "validateurs",
        "determinisme",
        "permissions_vs_air",
        "backend_vs_air",
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
