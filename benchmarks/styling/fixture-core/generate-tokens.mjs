// P-003 — GÉNÉRATION DES TOKENS depuis la SOURCE JSON UNIQUE (protocole :
// « Tokens identiques pour les 4 candidats, générés depuis une source JSON
// unique — préfigure le pipeline tokens double cible »).
// Sortie : tokens.generated.ts (module typé consommé par les 4 coquilles ;
// NativeWind consomme aussi tokens.json directement dans tailwind.config).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(HERE, "tokens.json"), "utf8"));

const out = `// GÉNÉRÉ par generate-tokens.mjs depuis tokens.json — NE PAS ÉDITER.
export const tokens = ${JSON.stringify(tokens, null, 2)} as const;
export type SchemeName = keyof typeof tokens.color;
export type Palette = (typeof tokens.color)[SchemeName];
`;
writeFileSync(join(HERE, "tokens.generated.ts"), out);
console.log("tokens.generated.ts écrit");
