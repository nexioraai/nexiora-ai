// CODEGEN — thème React Native depuis la SOURCE JSON UNIQUE (tokens.json).
// ROADMAP Phase 3 : « tokens compilés web+RN depuis la source JSON unique ».
// Cible RN uniquement (étape 3.1a) ; la cible CSS web est l'étape 3.1b.
// Sortie déterministe : même tokens.json => même fichier, à l'octet près
// (cliquet tests/generated-ratchet.test.ts).
// Usage : node scripts/generate.mjs [--out <chemin>]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const outIndex = process.argv.indexOf("--out");
const OUT =
  outIndex === -1
    ? join(PKG, "src", "theme.generated.ts")
    : process.argv[outIndex + 1];

const source = JSON.parse(readFileSync(join(PKG, "tokens.json"), "utf8"));
// TOKEN DÉRIVÉ (v2, P-007) : `primaryText` n'existe pas dans la source —
// il est CALCULÉ depuis l'accent et le fond, de sorte qu'une seule valeur
// (l'accent) reste la vérité. Le calcul garantit ≥ 4,5:1 pour n'importe
// quel accent, ce qui rend sûre la variété visuelle par app.
const { deriveTextInk } = await import("../src/derive.ts");
const withInk = (scheme) => ({
  ...source.color[scheme],
  // Les DEUX encres liées à l'accent sont dérivées : `primaryText` (accent
  // lu sur le fond) et `onPrimary` (texte lu SUR l'accent). Sur la palette
  // de base la seconde est une identité — la règle vaut pour les thèmes
  // par app, où l'accent peut changer.
  onPrimary: deriveTextInk(source.color[scheme].onPrimary, source.color[scheme].primary),
  primaryText: deriveTextInk(source.color[scheme].primary, source.color[scheme].bg),
});
// Le thème RN n'embarque que le jeu sémantique consommé par les primitives
// (D-021) — les sections `brand`/`web` sont réservées à la cible web (3.1b).
const theme = {
  color: { light: withInk("light"), dark: withInk("dark") },
  space: source.space,
  radius: source.radius,
  font: source.font,
  fontWeight: source.fontWeight,
  opacity: source.opacity,
  size: source.size,
};

const body = `// GÉNÉRÉ par scripts/generate.mjs depuis tokens.json — NE PAS ÉDITER.
// Thème React Native (D-021 : StyleSheet + tokens maison) — données pures,
// aucune dépendance de bibliothèque de styling (ARCHITECTURE §22, D-021 :
// le choix de styling ne fuite jamais dans les contrats ni dans ce module).
export const theme = ${JSON.stringify(theme, null, 2)} as const;
export type SchemeName = keyof typeof theme.color;
export type Palette = (typeof theme.color)[SchemeName];
`;
writeFileSync(OUT, body);
console.log(`thème RN écrit : ${OUT}`);
