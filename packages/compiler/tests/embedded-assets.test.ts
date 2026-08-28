// NON-DÉRIVE DES COPIES EMBARQUÉES (4.3, patron 3.1) : le module généré
// `embedded-assets.generated.ts` est recalculé depuis les VRAIES sources
// (paquets gelés + runtime compilateur) — toute divergence = CI rouge et
// regénération CONSCIENTE (scripts/embed-assets.mjs). Vérifie aussi que
// chaque réécriture d'import a bien été appliquée (aucun spécificateur de
// paquet moteur ne survit dans une copie).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EMBEDDED_SOURCES, buildEmbeddedAssets } from "../src/embed-lib.ts";
import { EMBEDDED_ASSETS } from "../src/embedded-assets.generated.ts";

const PACKAGES = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readSource = (rel: string): string => readFileSync(join(PACKAGES, rel), "utf8");

describe("copies embarquées — non-dérive", () => {
  it("le module généré = recalcul exact depuis les sources réelles", () => {
    expect(EMBEDDED_ASSETS).toEqual(buildEmbeddedAssets(readSource));
  });

  it("couvre exactement les cibles déclarées", () => {
    expect(Object.keys(EMBEDDED_ASSETS).sort()).toEqual(
      EMBEDDED_SOURCES.map((s) => s.target).sort(),
    );
  });

  it("aucun spécificateur de paquet moteur ne survit dans les copies", () => {
    for (const [target, content] of Object.entries(EMBEDDED_ASSETS)) {
      expect(content, target).not.toContain('from "@deribfy/');
    }
  });
});
