// THÈME PAR APP — DESIGN SYSTEM v2 (Phase 10, P-007 · ARCHITECTURE §22).
//
// Ce que ce module corrige (DS-01 / DET-021, mesuré) : les 12 documents du
// corpus déclarent 12 thèmes distincts et produisaient UNE SEULE identité
// visuelle, parce qu'aucun chemin de code ne lisait la section `design`.
//
// Le canal utilisé n'est PAS inventé : `design.overrides` existe déjà dans
// le schéma AIR GELÉ 1.0.0 (`flatConfigSchema`, clés pointées). La v2 se
// contente de le RENDRE EFFECTIF. Aucune convention nouvelle, aucune
// extension de schéma.
//
// Trois garde-fous, tous fail-closed :
//  1. ALLOWLIST POSITIVE de clés surchargeables — une clé hors liste est un
//     refus net, jamais une surcharge silencieusement ignorée ;
//  2. `primaryText` est INTERDIT à la surcharge : c'est un token DÉRIVÉ, et
//     laisser une app le fixer à la main rouvrirait exactement le défaut de
//     contraste que la dérivation ferme (DET-019) ;
//  3. la dérivation est REJOUÉE sur la palette effective — changer l'accent
//     recalcule l'encre de texte, donc le seuil WCAG tient par construction.
import { deriveTextInk, theme as BASE_THEME } from "@deribfy/design-tokens";
import type { ProjectAir } from "@deribfy/air-schema";

const SCHEMES = ["light", "dark"] as const;
const PALETTE_KEYS = [
  "bg",
  "surface",
  "text",
  "muted",
  "primary",
  "border",
  "error",
  "success",
  "warn",
  "badgeBg",
] as const;
const RADIUS_KEYS = ["sm", "md", "lg"] as const;

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Tokens DÉRIVÉS : jamais surchargeables (garde-fou 2).
 *
 * `onPrimary` en fait partie depuis la MESURE du slice 2 : avec un accent
 * bleu (#0B6E9B), l'encre statique #16181D tombait à 3,14:1 sur le bouton
 * primaire. Une encre FIXE ne peut pas rester lisible sur un accent
 * VARIABLE — dès lors que la v2 laisse l'app choisir son accent, les deux
 * encres qui s'y rapportent doivent suivre.
 */
export const DERIVED_KEYS: readonly string[] = SCHEMES.flatMap((s) => [
  `color.${s}.primaryText`,
  `color.${s}.onPrimary`,
]);

export const isOverridableKey = (key: string): boolean => {
  const parts = key.split(".");
  if (parts.length === 3 && parts[0] === "color") {
    return (
      SCHEMES.includes((parts[1] ?? "") as (typeof SCHEMES)[number]) &&
      PALETTE_KEYS.includes((parts[2] ?? "") as (typeof PALETTE_KEYS)[number])
    );
  }
  if (parts.length === 2 && parts[0] === "radius") {
    return RADIUS_KEYS.includes((parts[1] ?? "") as (typeof RADIUS_KEYS)[number]);
  }
  return false;
};

export interface ThemeOverrideProblem {
  readonly key: string;
  readonly code: string;
  readonly detail: string;
}

type Palette = Record<string, string>;
interface EffectiveTheme {
  color: Record<string, Palette>;
  space: Record<string, number>;
  radius: Record<string, number>;
  font: Record<string, number>;
  fontWeight: Record<string, string>;
  opacity: Record<string, number>;
  size: Record<string, number>;
}

const cloneBase = (): EffectiveTheme => JSON.parse(JSON.stringify(BASE_THEME)) as EffectiveTheme;

/**
 * Applique les surcharges de l'AIR au thème de base et rejoue la dérivation.
 * Renvoie les problèmes plutôt que de lever : l'appelant (l'émetteur) décide
 * du refus, l'Oracle du verdict.
 */
export function applyThemeOverrides(air: ProjectAir): {
  theme: EffectiveTheme;
  overrides: readonly { key: string; value: string | number }[];
  problems: readonly ThemeOverrideProblem[];
} {
  const effective = cloneBase();
  const problems: ThemeOverrideProblem[] = [];
  const applied: { key: string; value: string | number }[] = [];

  for (const entry of air.design.overrides ?? []) {
    const key = entry.key;
    const value = entry.value;
    if (DERIVED_KEYS.includes(key)) {
      problems.push({ key, code: "THEME_OVERRIDE_DERIVED", detail: "token dérivé, non surchargeable" });
      continue;
    }
    if (!isOverridableKey(key)) {
      problems.push({ key, code: "THEME_OVERRIDE_KEY_FORBIDDEN", detail: "hors allowlist de surcharge" });
      continue;
    }
    const parts = key.split(".");
    if (parts[0] === "color") {
      if (typeof value !== "string" || !HEX.test(value)) {
        problems.push({ key, code: "THEME_OVERRIDE_VALUE_INVALID", detail: "couleur #rrggbb attendue" });
        continue;
      }
      const scheme = effective.color[parts[1] ?? ""];
      if (scheme !== undefined) scheme[parts[2] ?? ""] = value.toUpperCase();
      applied.push({ key, value: value.toUpperCase() });
      continue;
    }
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      problems.push({ key, code: "THEME_OVERRIDE_VALUE_INVALID", detail: "entier positif attendu" });
      continue;
    }
    effective.radius[parts[1] ?? ""] = value;
    applied.push({ key, value });
  }

  // Garde-fou 3 : LES DEUX encres liées à l'accent le suivent toujours —
  // `primaryText` (accent lu sur le fond) et `onPrimary` (texte lu SUR
  // l'accent). Sur la palette de base, la dérivation est une identité
  // (5,62:1 déjà conforme) : un projet sans surcharge ne change donc pas.
  const base = cloneBase();
  for (const scheme of SCHEMES) {
    const palette = effective.color[scheme];
    if (palette === undefined) continue;
    palette.primaryText = deriveTextInk(palette.primary ?? "", palette.bg ?? "");
    palette.onPrimary = deriveTextInk(
      base.color[scheme]?.onPrimary ?? "",
      palette.primary ?? "",
    );
  }

  return { theme: effective, overrides: applied, problems };
}

/**
 * Module de thème du projet généré. Le format reproduit EXACTEMENT celui du
 * codegen `packages/design-tokens/scripts/generate.mjs` — propriété
 * vérifiée par test : sans surcharge, la sortie est byte-identique à la
 * copie embarquée, donc un projet sans thème par app ne change pas d'un
 * octet (additivité stricte).
 */
export function emitThemeModule(air: ProjectAir): string {
  const { theme } = applyThemeOverrides(air);
  return (
    "// GÉNÉRÉ par scripts/generate.mjs depuis tokens.json — NE PAS ÉDITER.\n" +
    "// Thème React Native (D-021 : StyleSheet + tokens maison) — données pures,\n" +
    "// aucune dépendance de bibliothèque de styling (ARCHITECTURE §22, D-021 :\n" +
    "// le choix de styling ne fuite jamais dans les contrats ni dans ce module).\n" +
    `export const theme = ${JSON.stringify(theme, null, 2)} as const;\n` +
    "export type SchemeName = keyof typeof theme.color;\n" +
    "export type Palette = (typeof theme.color)[SchemeName];\n"
  );
}

/** L'AIR demande-t-il une identité visuelle propre ? */
export const hasThemeOverrides = (air: ProjectAir): boolean =>
  (air.design.overrides ?? []).length > 0;
