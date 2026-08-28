// @deribfy/design-tokens — source de tokens unique + thème RN généré.
// AUCUN accès filesystem ici : ce module est consommable par les primitives
// React Native (la validation de tokens.json vit dans les tests, côté node ;
// les codegens vivent dans scripts/).
export { DESIGN_TOKENS_VERSION, designTokensSchema } from "./schema.ts";
export type { DesignTokens, TokenPalette } from "./schema.ts";
export { theme } from "./theme.generated.ts";
export type { Palette, SchemeName } from "./theme.generated.ts";
