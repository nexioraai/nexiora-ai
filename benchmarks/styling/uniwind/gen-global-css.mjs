// P-003 — GÉNÉRATION DU THÈME UNIWIND depuis la SOURCE DE TOKENS UNIQUE
// (tokens.json), symétrique de nativewind/tailwind.config.js qui lit la même
// source. Aucun token saisi à la main. Sortie : global.css (Tailwind v4).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(HERE, "..", "fixture-core", "tokens.json"), "utf8"));
const kebab = (s) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const vars = (obj, prefix, unit = "") =>
  Object.entries(obj).map(([k, v]) => `  --${prefix}-${kebab(k)}: ${v}${unit};`).join("\n");
const themeVars = (palette, indent) =>
  Object.entries(palette).map(([k, v]) => `${indent}--color-${kebab(k)}: ${v};`).join("\n");

const css = `/* GÉNÉRÉ par gen-global-css.mjs depuis fixture-core/tokens.json — NE PAS ÉDITER. */
@import 'tailwindcss';
@import 'uniwind';

@theme {
${vars(tokens.space, "spacing", "px")}
${vars(tokens.radius, "radius", "px")}
${vars(tokens.font, "text", "px")}
}

@layer theme {
  :root {
    @variant light {
${themeVars(tokens.color.light, "      ")}
    }

    @variant dark {
${themeVars(tokens.color.dark, "      ")}
    }
  }
}
`;
writeFileSync(join(HERE, "global.css"), css);
console.log("global.css écrit");
