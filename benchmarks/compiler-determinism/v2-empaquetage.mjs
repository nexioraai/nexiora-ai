// V2 (4.0, D-026) — MICRO-PREUVE DE DÉTERMINISME D'EMPAQUETAGE.
// Valide la chaîne « émission Option C → manifeste Merkle → hash racine »
// AVANT la construction du compilateur : sur 1 document du corpus ACTIF
// (v2), une maquette minimale d'émission produit (a) un module de données
// canonique (sérialiseur prouvé d'air-schema), (b) un fichier de code
// structurel émis par règles canoniques maison (seuls des identifiants
// validés par regex y sont interpolés), (c) un manifeste Merkle trié.
// Critère : N invocations de processus distinctes, sous des environnements
// différents (TZ/locale/cwd), produisent un hash racine STRICTEMENT
// identique. Toute divergence = échec, cause à démontrer avant correction
// (D-018). Zéro réseau, zéro LLM, 0 $.
// Usage : node v2-empaquetage.mjs <doc.air.json>   → écrit le hash racine
//         (le pilote v2-run.mjs orchestre les runs et journalise)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const { canonicalJson, sha256Hex } = await import(
  join(REPO, "packages/air-schema/src/canonical.ts")
);

const docPath = process.argv[2];
if (!docPath) throw new Error("usage: node v2-empaquetage.mjs <doc.air.json>");
const air = JSON.parse(readFileSync(docPath, "utf8"));

// --- Règles d'émission canoniques maison (S5) : LF, UTF-8 sans BOM,
// indentation 2 espaces, ordre d'émission = tri par point de code UTF-16
// des identifiants (localeCompare INTERDIT : dépend de l'ICU/locale).
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const ID_RE = /^[a-z][a-z0-9_]*$/;
const assertId = (s) => {
  if (!ID_RE.test(s)) throw new Error(`identifiant non conforme: ${s}`);
  return s;
};
// Un id AIR (préfixé scr_/blk_…) devient un identifiant de module PascalCase
// par transformation pure sur [a-z0-9_] uniquement.
const pascal = (id) =>
  assertId(id)
    .split("_")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join("");

// (a) MODULE DE DONNÉES CANONIQUE — toute la matière variable du document,
// sérialisée par le sérialiseur canonique prouvé (Phase 2).
function emitDataModule(screen) {
  const data = {
    blocks: screen.blocks,
    screenId: screen.id,
    title: screen.title,
  };
  return (
    "// GÉNÉRÉ — NE PAS ÉDITER (données canoniques, D-026 Option C)\n" +
    `export const screenData = ${canonicalJson(data)} as const;\n`
  );
}

// (b) CODE STRUCTUREL — composition ScreenShell + blocs (contrainte 3.4) ;
// AUCUN contenu libre : seuls des identifiants validés par ID_RE.
function emitScreenModule(screen) {
  const name = pascal(screen.id);
  const lines = [
    "// GÉNÉRÉ — NE PAS ÉDITER (code structurel, D-026 Option C)",
    `import { screenData } from "./${assertId(screen.id)}.data";`,
    "",
    `export function ${name}Screen() {`,
    "  return renderScreenShell(screenData);",
    "}",
    "",
  ];
  return lines.join("\n");
}

// --- Émission du jeu de fichiers (Map triée par chemin, point de code).
const files = new Map();
const screens = [...air.screens].sort((a, b) => byCodeUnit(a.id, b.id));
for (const screen of screens) {
  files.set(`screens/${screen.id}.data.ts`, emitDataModule(screen));
  files.set(`screens/${screen.id}.tsx`, emitScreenModule(screen));
}
files.set(
  "app.manifest.json",
  canonicalJson({
    airHash: sha256Hex(canonicalJson(air)),
    entryScreenId: air.navigation.entryScreenId,
    projectId: air.projectId,
  }) + "\n",
);

// --- Manifeste Merkle (S3) : SHA-256 par fichier (bytes UTF-8), manifeste
// canonique trié par chemin, hash racine = SHA-256 du manifeste.
// CONTRÔLE POSITIF (protocole V2) : V2_POISON=1 injecte volontairement une
// source de non-déterminisme (horodatage) — le pilote DOIT alors constater
// une divergence, sinon le dispositif de détection est invalide.
if (process.env.V2_POISON === "1") {
  files.set("poison.ts", `export const t = ${Date.now()};\n`);
}

const entries = [...files.keys()].sort(byCodeUnit).map((path) => ({
  path,
  sha256: sha256Hex(files.get(path)),
}));
const manifest = canonicalJson({ entries, merkleVersion: "1" });
const root = sha256Hex(manifest);

process.stdout.write(
  JSON.stringify({ fileCount: files.size, root }) + "\n",
);
