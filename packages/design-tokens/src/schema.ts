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

export const DESIGN_TOKENS_VERSION = "1.0.0";

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
  }),
});

export type DesignTokens = z.infer<typeof designTokensSchema>;
export type TokenPalette = z.infer<typeof paletteSchema>;
