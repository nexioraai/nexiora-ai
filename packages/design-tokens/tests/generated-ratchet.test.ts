import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { theme } from "../src";

// CLIQUET DE NON-DÉRIVE — le thème RN versionné (src/theme.generated.ts) doit
// être EXACTEMENT ce que le codegen produit depuis tokens.json : toute édition
// manuelle du fichier généré, ou tout changement de tokens.json sans
// régénération, fait échouer ce test. Vérifie aussi le déterminisme du codegen
// (préfiguration du critère dur de la Phase 4 : sortie byte-identique).
const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATE = join(PKG, "scripts", "generate.mjs");
const tmp = mkdtempSync(join(tmpdir(), "design-tokens-"));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const generate = (out: string): string => {
  execFileSync(process.execPath, [GENERATE, "--out", out]);
  return readFileSync(out, "utf8");
};

describe("codegen du thème RN", () => {
  it("est déterministe — deux exécutions produisent le même octet à octet", () => {
    const a = generate(join(tmp, "a.ts"));
    const b = generate(join(tmp, "b.ts"));
    expect(a).toBe(b);
  });

  it("CLIQUET — le fichier versionné est identique à une régénération", () => {
    const regenerated = generate(join(tmp, "check.ts"));
    const committed = readFileSync(
      join(PKG, "src", "theme.generated.ts"),
      "utf8",
    );
    expect(committed).toBe(regenerated);
  });

  it("le thème exporté reflète la source (color/space/radius/font, sans brand/web)", () => {
    const source: unknown = JSON.parse(
      readFileSync(join(PKG, "tokens.json"), "utf8"),
    );
    const src = source as {
      color: unknown;
      space: unknown;
      radius: unknown;
      font: unknown;
    };
    expect(theme).toEqual({
      color: src.color,
      space: src.space,
      radius: src.radius,
      font: src.font,
    });
    expect(Object.keys(theme)).toEqual(["color", "space", "radius", "font"]);
  });
});
