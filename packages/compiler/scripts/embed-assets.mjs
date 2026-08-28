// CODEGEN (4.3, patron 3.1) : génère src/embedded-assets.generated.ts
// depuis les VRAIES sources des paquets gelés + le runtime du compilateur,
// via la bibliothèque pure embed-lib. Le test de non-dérive recalcule et
// compare — regénérer ce module est un acte CONSCIENT (comme le scellé du
// train). Usage : node scripts/embed-assets.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGES = join(HERE, "..", "..");
const { buildEmbeddedAssets } = await import(join(HERE, "..", "src", "embed-lib.ts"));

const assets = buildEmbeddedAssets((rel) =>
  readFileSync(join(PACKAGES, rel), "utf8"),
);
const targets = Object.keys(assets).sort();
const fingerprint = createHash("sha256")
  .update(targets.map((t) => `${t} ${createHash("sha256").update(assets[t]).digest("hex")}`).join("\n"))
  .digest("hex");

const lines = [
  "// GÉNÉRÉ PAR scripts/embed-assets.mjs — NE PAS ÉDITER À LA MAIN.",
  "// Copies (imports réécrits) des sources gelées + runtime compilateur,",
  "// embarquées pour garder le chemin de compilation PUR (zéro fs).",
  "// Non-dérive garantie par tests/embedded-assets.test.ts.",
  "export const EMBEDDED_ASSETS: Readonly<Record<string, string>> = {",
  ...targets.map((t) => `  ${JSON.stringify(t)}: ${JSON.stringify(assets[t])},`),
  "};",
  "",
  `export const EMBEDDED_ASSETS_FINGERPRINT = ${JSON.stringify(fingerprint)};`,
  "",
];
writeFileSync(join(HERE, "..", "src", "embedded-assets.generated.ts"), lines.join("\n"));
console.log(`OK ${targets.length} fichiers, fingerprint ${fingerprint.slice(0, 16)}`);
