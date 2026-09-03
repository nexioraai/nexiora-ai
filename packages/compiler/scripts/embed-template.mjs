// CODEGEN (4.6, patron 3.1) : embarque les fichiers du GABARIT scellé
// (templateHash, D-027-R42) dans src/embedded-template.generated.ts — le
// chemin de compilation COMPLET (gabarit + émission) devient une fonction
// pure sans fs. Non-dérive : tests/embedded-template.test.ts recalcule
// depuis template/ et vérifie la cohérence avec le scellé du train.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(HERE, "..", "template");
const files = readdirSync(TEMPLATE).sort();
const lines = [
  "// GÉNÉRÉ PAR scripts/embed-template.mjs — NE PAS ÉDITER À LA MAIN.",
  "// Fichiers du gabarit scellé (templateHash) embarqués : le chemin de",
  "// compilation complet est PUR. Non-dérive : embedded-template.test.ts.",
  "export const EMBEDDED_TEMPLATE: Readonly<Record<string, string>> = {",
  ...files.map((f) => `  ${JSON.stringify(f)}: ${JSON.stringify(readFileSync(join(TEMPLATE, f), "utf8"))},`),
  "};",
  "",
];
writeFileSync(join(HERE, "..", "src", "embedded-template.generated.ts"), lines.join("\n"));
console.log(`OK ${files.length} fichiers du gabarit embarqués`);
