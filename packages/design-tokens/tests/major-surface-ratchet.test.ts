// CLIQUET DE SURFACE DE MAJEURE (D-039-R2) — rend MÉCANIQUE la compatibilité
// que le résolveur accepte désormais entre versions mineures de tokens.
//
// Pourquoi ce fichier existe : le résolveur accepte qu'un document épinglant
// 1.0.0 soit servi par un train embarquant 1.x. Sans ce cliquet, « mineure =
// compatible » ne serait qu'une PROMESSE portée par un numéro. Ici elle est
// VÉRIFIÉE : à l'intérieur d'une majeure, aucune clé de la surface gelée ne
// peut disparaître ni changer de type. Une évolution réellement incompatible
// devient donc impossible à livrer en mineure — elle casse ce test.
//
// BASELINE = surface exacte des tokens 1.0.0 (gelée en Phase 3, D-021/3.1).
// Elle ne se modifie QUE lors d'un passage de MAJEURE, avec décision consignée.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");

const BASELINE_MAJOR = 1;
const BASELINE_SURFACE: readonly (readonly [string, string])[] = [
  ["brand.accent", "string"],
  ["brand.bgDeep", "string"],
  ["brand.blue", "string"],
  ["brand.gold", "string"],
  ["brand.prune", "string"],
  ["color.dark.badgeBg", "string"],
  ["color.dark.bg", "string"],
  ["color.dark.border", "string"],
  ["color.dark.error", "string"],
  ["color.dark.muted", "string"],
  ["color.dark.onPrimary", "string"],
  ["color.dark.primary", "string"],
  ["color.dark.success", "string"],
  ["color.dark.surface", "string"],
  ["color.dark.text", "string"],
  ["color.dark.warn", "string"],
  ["color.light.badgeBg", "string"],
  ["color.light.bg", "string"],
  ["color.light.border", "string"],
  ["color.light.error", "string"],
  ["color.light.muted", "string"],
  ["color.light.onPrimary", "string"],
  ["color.light.primary", "string"],
  ["color.light.success", "string"],
  ["color.light.surface", "string"],
  ["color.light.text", "string"],
  ["color.light.warn", "string"],
  ["font.body", "number"],
  ["font.heading", "number"],
  ["font.label", "number"],
  ["font.title", "number"],
  ["radius.lg", "number"],
  ["radius.md", "number"],
  ["radius.sm", "number"],
  ["space.lg", "number"],
  ["space.md", "number"],
  ["space.sm", "number"],
  ["space.xl", "number"],
  ["space.xs", "number"],
  ["web.background.dark", "string"],
  ["web.background.light", "string"],
  ["web.foreground.dark", "string"],
  ["web.foreground.light", "string"],
];

function flatten(value: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      for (const [kk, vv] of flatten(v, prefix ? `${prefix}.${k}` : k)) {
        out.set(kk, vv);
      }
    }
  } else {
    out.set(prefix, typeof value);
  }
  return out;
}

describe("cliquet de surface de majeure — compatibilité mineure MÉCANIQUE", () => {
  const source = JSON.parse(
    readFileSync(join(PKG, "tokens.json"), "utf8"),
  ) as Record<string, unknown>;
  const version = String(source.tokensVersion);
  const major = Number(version.split(".")[0]);
  const surface = flatten(source);
  surface.delete("tokensVersion");

  it("la version reste dans la majeure de la baseline", () => {
    expect(major).toBe(BASELINE_MAJOR);
  });

  it("AUCUNE clé de la surface gelée n'a disparu", () => {
    const missing = BASELINE_SURFACE.filter(([k]) => !surface.has(k)).map(([k]) => k);
    expect(missing).toEqual([]);
  });

  it("AUCUNE clé de la surface gelée n'a changé de type", () => {
    const drifted = BASELINE_SURFACE.filter(
      ([k, t]) => surface.has(k) && surface.get(k) !== t,
    ).map(([k, t]) => `${k}: ${t} -> ${String(surface.get(k))}`);
    expect(drifted).toEqual([]);
  });

  it("les ajouts en mineure sont permis et tracés", () => {
    const known = new Set(BASELINE_SURFACE.map(([k]) => k));
    const added = [...surface.keys()].filter((k) => !known.has(k)).sort();
    // 1.1.0 (D-039) : cible tactile minimale, dimension A de la grille A++.
    // 1.2.0 (P-007, design system v2) : graisses, pas d'espacement fin et
    // opacité d'état — chacun avec un consommateur RÉEL dans les primitives
    // (ils suppriment les 9 valeurs de style en dur de DET-022).
    // `primaryText` n'apparaît PAS ici : c'est un token DÉRIVÉ, calculé par
    // le codegen depuis l'accent — la source garde une seule vérité.
    // 1.3.0 : `font.display`, un cran au-dessus de `heading`, ajouté AVEC son
    // consommateur réel — l'accroche de l'écran d'accueil produit. La règle de
    // DET-023 tient : aucun token « au cas où ».
    expect(added).toEqual([
      "font.display",
      "fontWeight.bold",
      "fontWeight.semibold",
      "opacity.disabled",
      "size.tapTarget",
      "space.xxs",
    ]);
  });
});
