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
import { contrast, deriveTextInk, theme as BASE_THEME } from "@deribfy/design-tokens";
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

/**
 * Rotation de TEINTE seule (D-067) — saturation et luminosité conservées.
 *
 * Conserver S et L est ce qui rend l'opération sûre : le contraste d'une
 * couleur dépend d'abord de sa luminosité, et `deriveTextInk` recalcule de
 * toute façon une encre conforme derrière. Fonction PURE et déterministe.
 */
function rotateHue(hex: string, degres: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  h = (h + degres + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [rr, gg, bb] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  const oct = (v: number): string =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${oct(rr)}${oct(gg)}${oct(bb)}`.toUpperCase();
}

/** Le PIRE contraste d'une encre parmi les surfaces où elle est réellement lue. */
function contrasteMin(encre: string, surfaces: readonly string[]): number {
  return Math.min(...surfaces.map((s) => contrast(encre, s)));
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

  // IDENTITÉ VISUELLE PAR THÈME (D-067) — `air.design.theme` n'était LU par
  // AUCUN étage : `themeNameEffective: false`. Conséquence mesurée au banc
  // anti-template : **12 documents, 12 thèmes déclarés, UNE SEULE identité
  // visuelle**. Le nom fait désormais tourner la teinte de l'accent.
  //
  // Sûr par construction : seule la TEINTE bouge, saturation et luminosité sont
  // conservées, et `deriveTextInk` recalcule ensuite une encre garantie ≥ 4,5:1
  // pour n'importe quel accent (dimension B). Déterministe : même nom → même
  // teinte, toujours. Les overrides explicites sont appliqués APRÈS et gardent
  // donc la priorité — le document reste maître.
  let rotation = 7;
  for (let i = 0; i < air.design.theme.length; i += 1) {
    rotation = (rotation * 31 + air.design.theme.charCodeAt(i)) % 360;
  }
  if (rotation !== 0) {
    for (const scheme of SCHEMES) {
      const palette = effective.color[scheme];
      if (palette === undefined) continue;
      // L'accent est porté par `primary` dans la palette effective (la clé
      // `brand.accent` de la source n'existe plus après dérivation).
      const accent = palette.primary;
      if (typeof accent === "string" && HEX.test(accent)) {
        palette.primary = rotateHue(accent, rotation);
      }
    }
  }

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
    // D-067 : l'encre est dérivée contre la surface la PLUS EXIGEANTE, pas
    // seulement contre le fond. Mesuré : avec des accents variés,
    // `dark:primaryText/surface` tombait à 4,16 alors que le couple sur `bg`
    // passait — le texte primaire s'affiche sur les DEUX. Dériver contre le fond
    // seul, c'était garantir le contraste là où on regardait, pas là où le texte
    // est lu.
    const fond = palette.bg ?? "";
    const surface = palette.surface ?? fond;
    const encreFond = deriveTextInk(palette.primary ?? "", fond);
    const encreSurface = deriveTextInk(palette.primary ?? "", surface);
    palette.primaryText =
      contrasteMin(encreFond, [fond, surface]) >= contrasteMin(encreSurface, [fond, surface])
        ? encreFond
        : encreSurface;
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

/**
 * L'AIR demande-t-il une identité visuelle propre ?
 *
 * D-067 : un THÈME NOMMÉ en demande une, au même titre qu'une surcharge
 * explicite. Sans cela, les 12 documents du corpus — qui déclarent 12 thèmes
 * distincts mais AUCUNE surcharge (la campagne D-025 les leur interdisait) —
 * produisaient tous la MÊME identité visuelle. Le nom était transporté et sans
 * effet : c'était exactement `themeNameEffective: false`.
 */
export const hasThemeOverrides = (air: ProjectAir): boolean =>
  (air.design.overrides ?? []).length > 0 || air.design.theme.length > 0;
