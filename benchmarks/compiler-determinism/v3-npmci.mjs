// V3 (4.0, D-026) — REPRODUCTIBILITÉ DE L'INSTALLATION DU GABARIT (S4).
// Le gabarit du release train v1 embarque un package-lock.json PRÉ-RÉSOLU
// et versionné ; AUCUN npm install dans le chemin de compilation.
// L'installation ne sert qu'au lancement de l'app témoin (hors périmètre
// du hash de sortie). Cette sonde prouve le MÉCANISME :
//  1. génération du lockfile depuis les pins démontrés (harnais 3.4 :
//     expo ~57.0.17 · react-native 0.86.3 · react 19.2.3) — UNE fois,
//     puis regénéré une 2e fois pour mesurer la stabilité de génération ;
//  2. `npm ci --ignore-scripts` (politique sandbox §8) ×2, environnements
//     différents (TZ/locale) ;
//  3. hash intégral des deux arbres node_modules (contenu des fichiers +
//     cibles de liens symboliques, chemins triés par point de code) ;
//  4. vérification que npm ci n'a PAS modifié le lockfile (byte-identique).
// Répertoires lourds dans le scratchpad de session ; SEULS les hashes et
// verdicts sont journalisés dans results/.
// Usage : node v3-npmci.mjs <workdir>
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = process.argv[2];
if (!WORK) throw new Error("usage: node v3-npmci.mjs <workdir>");
const LOG = join(HERE, "results", "v3-npmci.jsonl");
mkdirSync(join(HERE, "results"), { recursive: true });
const log = (o) => {
  appendFileSync(LOG, JSON.stringify(o) + "\n");
  console.log(JSON.stringify(o));
};

const PKG = {
  name: "v3-gabarit-sonde",
  version: "0.0.0",
  private: true,
  dependencies: {
    expo: "~57.0.17",
    "expo-status-bar": "~3.0.9",
    react: "19.2.3",
    "react-native": "0.86.3",
  },
};

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Hash intégral d'un arbre : chemins relatifs triés, contenu ou cible de
// symlink ; les répertoires n'apportent que leurs enfants.
function hashTree(root) {
  const entries = [];
  const walk = (rel) => {
    const abs = join(root, rel);
    for (const name of readdirSync(abs).sort(byCodeUnit)) {
      const childRel = rel ? `${rel}/${name}` : name;
      const st = lstatSync(join(root, childRel));
      if (st.isSymbolicLink()) {
        entries.push(`L ${childRel} ${sha256(readlinkSync(join(root, childRel)))}`);
      } else if (st.isDirectory()) {
        walk(childRel);
      } else {
        entries.push(`F ${childRel} ${sha256(readFileSync(join(root, childRel)))}`);
      }
    }
  };
  walk("");
  return { fileCount: entries.length, root: sha256(entries.join("\n")) };
}

const npm = (args, cwd, env = {}) =>
  execFileSync("npm", args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

// --- 1. Lockfile : génération ×2 depuis le même package.json.
const gen = join(WORK, "gen");
const gen2 = join(WORK, "gen2");
for (const d of [gen, gen2]) {
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "package.json"), JSON.stringify(PKG, null, 2) + "\n");
}
npm(["install", "--package-lock-only", "--ignore-scripts"], gen);
npm(["install", "--package-lock-only", "--ignore-scripts"], gen2);
const lockA = readFileSync(join(gen, "package-lock.json"));
const lockB = readFileSync(join(gen2, "package-lock.json"));
log({
  etape: "generation-lockfile",
  identiques: sha256(lockA) === sha256(lockB),
  sha256: sha256(lockA).slice(0, 16),
});

// --- 2. npm ci ×2 depuis le lockfile de gen (l'artefact versionné).
const runs = [
  { name: "ci-A", env: {} },
  { name: "ci-B", env: { TZ: "Pacific/Auckland", LANG: "tr_TR.UTF-8", LC_ALL: "tr_TR.UTF-8" } },
];
const treeHashes = [];
for (const { name, env } of runs) {
  const d = join(WORK, name);
  mkdirSync(d, { recursive: true });
  copyFileSync(join(gen, "package.json"), join(d, "package.json"));
  copyFileSync(join(gen, "package-lock.json"), join(d, "package-lock.json"));
  npm(["ci", "--ignore-scripts"], d, env);
  const lockAfter = readFileSync(join(d, "package-lock.json"));
  const tree = hashTree(join(d, "node_modules"));
  treeHashes.push(tree.root);
  log({
    etape: name,
    lockfileIntact: sha256(lockAfter) === sha256(lockA),
    fileCount: tree.fileCount,
    treeRoot: tree.root,
  });
}

const verdict =
  treeHashes.length === 2 && treeHashes[0] === treeHashes[1]
    ? "ARBRES IDENTIQUES 2/2"
    : "DIVERGENCE";
log({ etape: "verdict", verdict });
process.exitCode = verdict === "ARBRES IDENTIQUES 2/2" ? 0 : 1;
