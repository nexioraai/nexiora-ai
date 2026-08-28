// 4.2 (D-026 S4) — PREUVES DU GABARIT RÉEL `packages/compiler/template/` :
//  A. `npm ci --ignore-scripts` ×2 (env standard + env hostile TZ/locale)
//     sur des COPIES du gabarit → hash intégral des deux arbres
//     node_modules IDENTIQUE ; lockfile byte-intact après installation.
//     (Procédure V3, rejouée sur l'artefact réel — le gabarit du dépôt ne
//     reçoit JAMAIS de node_modules.)
//  B. FUMÉE : copie + App.tsx/app.json jetables (hors gabarit — émis par
//     le compilateur en 4.3/4.4) → `expo export` ios+android EXIT=0 et
//     bundles Hermes produits : le jeu de versions verrouillé bundle
//     réellement.
// Journal : results/v42-gabarit.jsonl. Zéro réseau après le npm ci initial
// (cache npm) ; zéro LLM ; 0 $.
// Usage : node v42-gabarit.mjs <workdir>
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
const TEMPLATE = join(HERE, "..", "..", "packages", "compiler", "template");
const WORK = process.argv[2];
if (!WORK) throw new Error("usage: node v42-gabarit.mjs <workdir>");
const LOG = join(HERE, "results", "v42-gabarit.jsonl");
mkdirSync(join(HERE, "results"), { recursive: true });
const log = (o) => {
  appendFileSync(LOG, JSON.stringify(o) + "\n");
  console.log(JSON.stringify(o));
};

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const TEMPLATE_FILES = [".gitignore", "index.ts", "package.json", "package-lock.json", "tsconfig.json"];
const copyTemplate = (dest) => {
  mkdirSync(dest, { recursive: true });
  for (const f of TEMPLATE_FILES) copyFileSync(join(TEMPLATE, f), join(dest, f));
};

function hashTree(root) {
  const entries = [];
  const walk = (rel) => {
    const abs = join(root, rel || ".");
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

const run = (cmd, args, cwd, env = {}) =>
  execFileSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const lockRef = sha256(readFileSync(join(TEMPLATE, "package-lock.json")));

// --- A. npm ci ×2, environnements différents.
const treeHashes = [];
for (const { name, env } of [
  { name: "ci-A", env: {} },
  { name: "ci-B", env: { TZ: "Pacific/Auckland", LANG: "tr_TR.UTF-8", LC_ALL: "tr_TR.UTF-8" } },
]) {
  const d = join(WORK, name);
  copyTemplate(d);
  run("npm", ["ci", "--ignore-scripts"], d, env);
  const tree = hashTree(join(d, "node_modules"));
  treeHashes.push(tree.root);
  log({
    etape: name,
    lockfileIntact: sha256(readFileSync(join(d, "package-lock.json"))) === lockRef,
    fileCount: tree.fileCount,
    treeRoot: tree.root,
  });
}
const ciOk = treeHashes[0] === treeHashes[1];
log({ etape: "verdict-npmci", verdict: ciOk ? "ARBRES IDENTIQUES 2/2" : "DIVERGENCE" });

// --- B. Fumée d'export (App/app.json JETABLES, hors gabarit).
const smoke = join(WORK, "smoke");
copyTemplate(smoke);
writeFileSync(
  join(smoke, "App.tsx"),
  '// JETABLE (fumée 4.2) — le vrai App est émis par le compilateur (4.3).\nimport { Text, View } from "react-native";\n\nexport default function App() {\n  return (\n    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>\n      <Text testID="smoke">gabarit</Text>\n    </View>\n  );\n}\n',
);
writeFileSync(
  join(smoke, "app.json"),
  JSON.stringify(
    { expo: { name: "smoke", slug: "smoke", version: "1.0.0" } },
    null,
    2,
  ) + "\n",
);
run("npm", ["ci", "--ignore-scripts"], smoke);
run("npx", ["expo", "export", "--platform", "ios", "--platform", "android", "--output-dir", "dist"], smoke);
const bundles = [];
for (const plat of ["ios", "android"]) {
  const dir = join(smoke, "dist", "_expo", "static", "js", plat);
  const hbc = readdirSync(dir).filter((f) => f.endsWith(".hbc"));
  bundles.push({ plat, count: hbc.length });
}
const smokeOk = bundles.every((b) => b.count === 1);
log({ etape: "fumee-export", bundles, verdict: smokeOk ? "EXPORT OK ios+android" : "ÉCHEC" });

process.exitCode = ciOk && smokeOk ? 0 : 1;
