import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { primitives } from "../src";

// CLIQUET D'ÉTANCHÉITÉ CONTRACTUELLE (§22, D-021 — patron prouvé 6/6 au banc
// P-003, ici MÉCANISÉ) : les contrats n'importent QUE des types de `react`.
// Toute fuite d'une bibliothèque de styling (ou de react-native) dans les
// contrats fait échouer ce test — le moteur de styling reste remplaçable
// sans toucher aux contrats, aux blocs ni à l'AIR.
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

describe("étanchéité des contrats", () => {
  it("CLIQUET — contracts.ts n'importe que des types de react", () => {
    const source = readFileSync(join(SRC, "contracts.ts"), "utf8");
    const imports = [...source.matchAll(/^import\s[^;]*?from\s+"([^"]+)";?$/gms)].map(
      (m) => m[1],
    );
    expect(imports).toEqual(["react"]);
    // et uniquement des TYPES (aucune valeur importée → aucun runtime).
    expect(source).toMatch(/import type \{/);
    expect(source).not.toMatch(/^import \{/m);
  });

  it("CLIQUET — les 9 primitives v1 validées sont toutes présentes, sans extra", () => {
    expect(Object.keys(primitives).sort()).toEqual([
      "AppButton",
      "AppText",
      "Badge",
      "ListRow",
      "ScreenShell",
      "Section",
      "Spinner",
      "StateView",
      "TextField",
    ]);
  });
});
