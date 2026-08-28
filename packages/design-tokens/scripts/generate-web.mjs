// CODEGEN — cible CSS WEB depuis la SOURCE JSON UNIQUE (tokens.json).
// ROADMAP Phase 3, étape 3.1b : « tokens compilés web+RN depuis la source
// JSON unique » (ARCHITECTURE §22 : JSON → codegen → CSS web existant).
// SORTIE : theme.web.generated.css — ARTEFACT SÉPARÉ. Ce script ne touche
// JAMAIS à apps/web/src/app/globals.css : la bascule est une décision
// propriétaire distincte (arbitrage A), prise sur preuve d'équivalence.
// Usage : node scripts/generate-web.mjs [--out <chemin>]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const outIndex = process.argv.indexOf("--out");
const OUT =
  outIndex === -1
    ? join(PKG, "theme.web.generated.css")
    : process.argv[outIndex + 1];

const t = JSON.parse(readFileSync(join(PKG, "tokens.json"), "utf8"));

// Correspondance EXPLICITE tokens de marque -> variables CSS du produit
// (noms historiques de apps/web/src/app/globals.css — CLAUDE.md « Tokens »).
const BRAND_VARS = [
  ["--color-accent", t.brand.accent],
  ["--color-bg-deep", t.brand.bgDeep],
  ["--color-brand-blue", t.brand.blue],
  ["--color-brand-gold", t.brand.gold],
  ["--color-brand-prune", t.brand.prune],
];

// Les renvois var() et les polices Geist sont du CÂBLAGE STRUCTUREL du
// produit web (next/font + bascule light/dark par variables), pas des
// valeurs de tokens : ils sont émis tels quels, à l'identique de l'existant.
const css = `:root {
  --background: ${t.web.background.light};
  --foreground: ${t.web.foreground.light};
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
${BRAND_VARS.map(([name, value]) => `  ${name}: ${value};`).join("\n")}
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: ${t.web.background.dark};
    --foreground: ${t.web.foreground.dark};
  }
}
`;
writeFileSync(OUT, css);
console.log(`CSS web écrit : ${OUT}`);
