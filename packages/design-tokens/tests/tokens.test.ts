import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DESIGN_TOKENS_VERSION, designTokensSchema } from "../src";

// SOURCE DE TOKENS UNIQUE (ROADMAP Phase 3) : tokens.json est validé ici de
// façon stricte, et ses valeurs de marque sont VERROUILLÉES par cliquet —
// changer la palette produit doit être un acte conscient, jamais un effet
// de bord (patron du cliquet de registre, D-020).
const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = designTokensSchema.parse(
  JSON.parse(readFileSync(join(PKG, "tokens.json"), "utf8")),
);

// Palette produit officielle — PROVENANCE : CLAUDE.md (« Design system —
// Redesign Deribfy ») et bloc @theme de apps/web/src/app/globals.css.
const BRAND_PRODUIT = {
  accent: "#FA5D1E",
  bgDeep: "#0A050E",
  blue: "#4F6EF5",
  gold: "#C9A84C",
  prune: "#8B2252",
} as const;

describe("source de tokens unique", () => {
  it("est conforme au schéma strict (le parse ci-dessus est la preuve)", () => {
    expect(source.tokensVersion).toBe(DESIGN_TOKENS_VERSION);
  });

  it("CLIQUET — la palette de marque est exactement la palette produit", () => {
    expect(source.brand).toEqual(BRAND_PRODUIT);
  });

  it("CLIQUET — les variables web reprennent globals.css à l'identique", () => {
    expect(source.web).toEqual({
      background: { light: "#ffffff", dark: "#0a0a0a" },
      foreground: { light: "#171717", dark: "#ededed" },
    });
  });

  it("les palettes light et dark portent exactement les mêmes clés", () => {
    expect(Object.keys(source.color.light)).toEqual(
      Object.keys(source.color.dark),
    );
  });

  it("traçabilité produit — l'accent de marque EST la couleur primary des deux schémas", () => {
    expect(source.color.light.primary).toBe(BRAND_PRODUIT.accent);
    expect(source.color.dark.primary).toBe(BRAND_PRODUIT.accent);
  });

  it("traçabilité produit — le fond sombre RN EST le background deep de la marque", () => {
    expect(source.color.dark.bg).toBe(BRAND_PRODUIT.bgDeep);
  });

  it("les échelles sont strictement croissantes (space, radius, font)", () => {
    const croissante = (values: number[]): void => {
      values.reduce((prev, next) => {
        expect(next).toBeGreaterThan(prev);
        return next;
      });
    };
    croissante([
      source.space.xs,
      source.space.sm,
      source.space.md,
      source.space.lg,
      source.space.xl,
    ]);
    croissante([source.radius.sm, source.radius.md, source.radius.lg]);
    croissante([
      source.font.label,
      source.font.body,
      source.font.title,
      source.font.heading,
    ]);
  });
});
