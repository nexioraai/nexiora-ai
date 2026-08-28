import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// CLIQUET DE NON-DÉRIVE — cible CSS WEB (étape 3.1b). Même règle que le thème
// RN : l'artefact versionné doit être EXACTEMENT ce que le codegen produit
// depuis tokens.json. AUCUN couplage à apps/web ici : tant que la bascule de
// globals.css n'est pas arbitrée (arbitrage propriétaire A), l'autorité sur le
// produit reste globals.css — ce test ne verrouille que la cohérence interne
// source → artefact.
const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATE = join(PKG, "scripts", "generate-web.mjs");
const tmp = mkdtempSync(join(tmpdir(), "design-tokens-web-"));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const generate = (out: string): string => {
  execFileSync(process.execPath, [GENERATE, "--out", out]);
  return readFileSync(out, "utf8");
};

describe("codegen de la cible CSS web", () => {
  it("est déterministe — deux exécutions produisent le même octet à octet", () => {
    expect(generate(join(tmp, "a.css"))).toBe(generate(join(tmp, "b.css")));
  });

  it("CLIQUET — l'artefact versionné est identique à une régénération", () => {
    const regenerated = generate(join(tmp, "check.css"));
    const committed = readFileSync(join(PKG, "theme.web.generated.css"), "utf8");
    expect(committed).toBe(regenerated);
  });

  it("porte exactement les 5 variables de marque du produit (CLAUDE.md)", () => {
    const css = readFileSync(join(PKG, "theme.web.generated.css"), "utf8");
    expect(css).toContain("--color-accent: #FA5D1E;");
    expect(css).toContain("--color-bg-deep: #0A050E;");
    expect(css).toContain("--color-brand-blue: #4F6EF5;");
    expect(css).toContain("--color-brand-gold: #C9A84C;");
    expect(css).toContain("--color-brand-prune: #8B2252;");
  });
});
