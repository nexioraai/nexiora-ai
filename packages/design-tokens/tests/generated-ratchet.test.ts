import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { theme } from "../src";
import { deriveTextInk } from "../src/derive.ts";

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

  it("le thème exporté reflète la source (color/space/radius/font/size, sans brand/web)", () => {
    const source: unknown = JSON.parse(
      readFileSync(join(PKG, "tokens.json"), "utf8"),
    );
    const src = source as {
      color: unknown;
      space: unknown;
      radius: unknown;
      font: unknown;
      fontWeight: unknown;
      opacity: unknown;
      size: unknown;
    };
    // ÉDITION CONSCIENTE (v2, P-007) : le thème porte deux groupes de plus
    // ET un token DÉRIVÉ par schéma. Le cliquet ne constate pas seulement sa
    // présence : il RECALCULE la dérivation et exige l'égalité — une dérive
    // du codegen casserait donc ce test.
    const attenduColor = Object.fromEntries(
      Object.entries(src.color as Record<string, Record<string, string>>).map(([scheme, palette]) => [
        scheme,
        { ...palette, primaryText: deriveTextInk(palette.primary ?? "", palette.bg ?? "") },
      ]),
    );
    expect(theme).toEqual({
      color: attenduColor,
      space: src.space,
      radius: src.radius,
      font: src.font,
      fontWeight: src.fontWeight,
      opacity: src.opacity,
      size: src.size,
    });
    expect(Object.keys(theme)).toEqual([
      "color",
      "space",
      "radius",
      "font",
      "fontWeight",
      "opacity",
      "size",
    ]);
  });
});
