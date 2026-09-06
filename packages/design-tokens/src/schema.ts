// SOURCE DE TOKENS UNIQUE (ARCHITECTURE §22, ROADMAP Phase 3) — schéma STRICT
// de `tokens.json`. Provenance des valeurs (aucune inventée) :
//   - `brand` : palette produit officielle (CLAUDE.md, bloc @theme de
//     apps/web/src/app/globals.css) ;
//   - `web` : variables background/foreground light/dark de globals.css ;
//   - `color`/`space`/`radius`/`font` : jeu sémantique RN éprouvé au banc
//     P-003 (D-021 — StyleSheet + tokens maison).
// Le sens du flux est JSON → codegen → (CSS web, thème RN) — jamais l'inverse
// (vigilance consignée en D-021).
import { z } from "zod";

// 1.3.0 — l'échelle typographique gagne `display`, un cran au-dessus de
// `heading`, avec son consommateur réel (accroche de l'écran d'accueil).
export const DESIGN_TOKENS_VERSION = "1.3.0";

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const dimension = z.number().int().positive();

// Palette par schéma : light et dark portent EXACTEMENT les mêmes clés
// (objet strict partagé — une clé manquante ou en trop est une erreur).
const paletteSchema = z.strictObject({
  bg: hexColor,
  surface: hexColor,
  text: hexColor,
  muted: hexColor,
  primary: hexColor,
  onPrimary: hexColor,
  border: hexColor,
  error: hexColor,
  success: hexColor,
  warn: hexColor,
  badgeBg: hexColor,
});

export const designTokensSchema = z.strictObject({
  tokensVersion: z.literal(DESIGN_TOKENS_VERSION),
  brand: z.strictObject({
    accent: hexColor,
    bgDeep: hexColor,
    blue: hexColor,
    gold: hexColor,
    prune: hexColor,
  }),
  web: z.strictObject({
    background: z.strictObject({ light: hexColor, dark: hexColor }),
    foreground: z.strictObject({ light: hexColor, dark: hexColor }),
  }),
  color: z.strictObject({ light: paletteSchema, dark: paletteSchema }),
  space: z.strictObject({
    // `xxs` (v2) : le pas fin qu'exigeait le badge, jusque-là écrit en dur.
    xxs: dimension,
    xs: dimension,
    sm: dimension,
    md: dimension,
    lg: dimension,
    xl: dimension,
  }),
  radius: z.strictObject({ sm: dimension, md: dimension, lg: dimension }),
  font: z.strictObject({
    label: dimension,
    body: dimension,
    title: dimension,
    heading: dimension,
    /**
     * DISPLAY (1.3.0) — un cran AU-DESSUS de `heading`, pour la PREMIÈRE
     * phrase qu'une personne lit. Ajouté avec son consommateur réel (l'écran
     * d'accueil produit), jamais « au cas où » : c'est la règle que DET-023 a
     * posée quand `elevation`/`motion` ont été écartés.
     */
    display: dimension,
  }),
  // DESIGN SYSTEM v2 (P-007, Phase 10) — trois groupes AJOUTÉS, chacun avec
  // un consommateur RÉEL dans les primitives ; aucun token « au cas où ».
  // `fontWeight` et `space.xxs` suppriment les 9 valeurs de style en dur
  // mesurées (DET-022) ; `opacity` tokenise l'opacité d'état désactivé.
  // Ce qui n'a PAS été ajouté et pourquoi : `elevation`, `motion`,
  // `breakpoint`/`density` n'ont AUCUN consommateur dans le design system
  // v1 — les introduire serait spéculatif (arbitrage consigné, DET-023).
  fontWeight: z.strictObject({
    semibold: z.string().regex(/^[1-9]00$/),
    bold: z.string().regex(/^[1-9]00$/),
  }),
  opacity: z.strictObject({ disabled: z.number().gt(0).lt(1) }),
  // Cible tactile minimale (grille A++ dimension A, D-039). 48 satisfait
  // SIMULTANÉMENT les deux normes — 44 pt (iOS HIG) et 48 dp (Material) —
  // ce qui évite toute ramification `Platform.OS` : le code généré reste
  // strictement identique sur les deux plateformes (propriété prouvée au
  // scorecard du slice 1).
  size: z.strictObject({ tapTarget: dimension }),
});

export type DesignTokens = z.infer<typeof designTokensSchema>;
export type TokenPalette = z.infer<typeof paletteSchema>;
