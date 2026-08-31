// THÈME PAR APP — DESIGN SYSTEM v2 (Phase 10, P-007).
//
// Propriétés prouvées :
//  1. ADDITIVITÉ STRICTE — sans surcharge, la sortie reste byte-identique à
//     la copie embarquée (aucun projet existant n'est touché) ;
//  2. le canal utilisé est celui du schéma GELÉ (`design.overrides`) ;
//  3. l'encre de texte est RE-DÉRIVÉE de l'accent effectif — une app ne
//     peut pas casser le contraste de ses textes en changeant sa couleur ;
//  4. fail-closed : clé hors allowlist, token dérivé, valeur invalide.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProjectAir } from "@deribfy/air-schema";
import { contrast, theme as BASE } from "@deribfy/design-tokens";
import { compileProject } from "../src/compile-project.ts";
import { EmitError } from "../src/emit-project.ts";
import { applyThemeOverrides, emitThemeModule, isOverridableKey } from "../src/emit-theme.ts";
import { EMBEDDED_ASSETS } from "../src/embedded-assets.generated.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus", "corpus-v2");
const docs = readdirSync(CORPUS)
  .filter((f) => f.endsWith(".air.json"))
  .sort();
const load = (f: string): ProjectAir => JSON.parse(readFileSync(join(CORPUS, f), "utf8")) as ProjectAir;
const resto = load("resto-quartier.air.json");
const withOverrides = (entries: { key: string; value: string | number }[]): ProjectAir =>
  ({ ...resto, design: { ...resto.design, overrides: entries } });

describe("additivité — aucune surcharge, aucun changement", () => {
  it("12/12 documents du corpus : thème émis = copie embarquée, à l'octet", () => {
    for (const file of docs) {
      const compiled = compileProject(load(file));
      expect(compiled.files.get("lib/tokens/theme.generated.ts"), file).toBe(
        EMBEDDED_ASSETS["lib/tokens/theme.generated.ts"],
      );
    }
  });

  it("le générateur de module reproduit EXACTEMENT le format du codegen", () => {
    expect(emitThemeModule(resto)).toBe(EMBEDDED_ASSETS["lib/tokens/theme.generated.ts"]);
  });
});

describe("identité visuelle par app", () => {
  const air = withOverrides([
    { key: "color.light.primary", value: "#1B6AA5" },
    { key: "color.dark.primary", value: "#1B6AA5" },
    { key: "radius.md", value: 4 },
  ]);

  it("les surcharges autorisées atteignent l'artefact", () => {
    const module = compileProject(air).files.get("lib/tokens/theme.generated.ts") ?? "";
    expect(module).toContain('"primary": "#1B6AA5"');
    expect(module).toContain('"md": 4');
    expect(module).not.toBe(EMBEDDED_ASSETS["lib/tokens/theme.generated.ts"]);
  });

  it("l'artefact CHANGE (rootHash) — l'identité visuelle est dans le hash", () => {
    expect(compileProject(air).rootHash).not.toBe(compileProject(resto).rootHash);
  });

  it("déterminisme conservé : 5 compilations, un seul hash", () => {
    const hashes = Array.from({ length: 5 }, () => compileProject(air).rootHash);
    expect(new Set(hashes).size).toBe(1);
  });

  it("LES DEUX encres liées à l'accent sont dérivées, ≥ 4,5:1 pour tout accent", () => {
    // Défaut MESURÉ sur le slice 2 avant cette règle : avec l'accent bleu
    // #0B6E9B, l'encre statique du bouton primaire tombait à 3,14:1. Une
    // encre fixe ne peut pas rester lisible sur un accent variable.
    for (const accent of ["#1B6AA5", "#FFE000", "#00FF88", "#111111", "#FA5D1E", "#C0C0C0", "#0B6E9B"]) {
      const { theme } = applyThemeOverrides(
        withOverrides([
          { key: "color.light.primary", value: accent },
          { key: "color.dark.primary", value: accent },
        ]),
      );
      for (const scheme of ["light", "dark"] as const) {
        const palette = theme.color[scheme] ?? {};
        // texte de l'accent, lu sur le fond
        expect(
          contrast(palette.primaryText ?? "", palette.bg ?? ""),
          `primaryText ${accent}/${scheme}`,
        ).toBeGreaterThanOrEqual(4.5);
        // libellé du bouton, lu SUR l'accent
        expect(
          contrast(palette.onPrimary ?? "", palette.primary ?? ""),
          `onPrimary ${accent}/${scheme}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("l'accent de marque reste intact quand il n'est pas surchargé", () => {
    const { theme } = applyThemeOverrides(withOverrides([{ key: "radius.sm", value: 2 }]));
    expect(theme.color.light?.primary).toBe(BASE.color.light.primary);
  });
});

describe("fail-closed", () => {
  const refus = (entries: { key: string; value: string | number }[], code: string) => {
    expect(() => compileProject(withOverrides(entries))).toThrow(EmitError);
    try {
      compileProject(withOverrides(entries));
    } catch (e) {
      expect((e as EmitError).code).toBe(code);
    }
  };

  it("clé hors allowlist", () => {
    refus([{ key: "font.body", value: 20 }], "THEME_OVERRIDE_KEY_FORBIDDEN");
    refus([{ key: "size.tapTarget", value: 12 }], "THEME_OVERRIDE_KEY_FORBIDDEN");
    refus([{ key: "color.light.inconnu", value: "#000000" }], "THEME_OVERRIDE_KEY_FORBIDDEN");
  });

  it("tokens DÉRIVÉS : surcharge interdite (sinon le contraste redevient cassable)", () => {
    refus([{ key: "color.light.primaryText", value: "#FF0000" }], "THEME_OVERRIDE_DERIVED");
    refus([{ key: "color.dark.onPrimary", value: "#FF0000" }], "THEME_OVERRIDE_DERIVED");
  });

  it("valeur invalide", () => {
    refus([{ key: "color.light.primary", value: "bleu" }], "THEME_OVERRIDE_VALUE_INVALID");
    refus([{ key: "radius.md", value: -3 }], "THEME_OVERRIDE_VALUE_INVALID");
  });

  it("l'allowlist de clés est explicite et close", () => {
    expect(isOverridableKey("color.dark.badgeBg")).toBe(true);
    expect(isOverridableKey("color.light.onPrimary")).toBe(false);
    expect(isOverridableKey("radius.lg")).toBe(true);
    expect(isOverridableKey("space.md")).toBe(false);
    expect(isOverridableKey("opacity.disabled")).toBe(false);
    expect(isOverridableKey("color.autre.bg")).toBe(false);
  });
});
