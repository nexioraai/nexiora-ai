// 4.3 (D-028) — PREUVE RÉELLE DE L'ÉMISSION : pour des documents du corpus
// ACTIF v2, assembler gabarit + émission dans le scratchpad, installer
// (npm ci --ignore-scripts, HORS chemin de compilation), puis :
//  1. `tsc --noEmit` STRICT du projet généré (les copies, le runtime, les
//     écrans émis et les modules canoniques typent ensemble) ;
//  2. `expo export` ios+android (metro résout et bundle réellement) sur le
//     premier document.
// Journal : results/v43-emission.jsonl. Zéro LLM ; 0 $.
// Usage : node v43-emission.mjs <workdir> <doc1.air.json> [doc2...]
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const TEMPLATE = join(REPO, "packages", "compiler", "template");
const CORPUS = join(REPO, "packages", "golden-corpus", "corpus-v2");
const [WORK, ...docs] = process.argv.slice(2);
if (!WORK || docs.length === 0) {
  throw new Error("usage: node v43-emission.mjs <workdir> <doc.air.json>...");
}
const { emitProject } = await import(join(REPO, "packages/compiler/src/emit-project.ts"));

const LOG = join(HERE, "results", "v43-emission.jsonl");
mkdirSync(join(HERE, "results"), { recursive: true });
const log = (o) => {
  appendFileSync(LOG, JSON.stringify(o) + "\n");
  console.log(JSON.stringify(o));
};

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

let allOk = true;
let first = true;
for (const doc of docs) {
  const air = JSON.parse(readFileSync(join(CORPUS, doc), "utf8"));
  const { files } = emitProject(air);
  const dir = join(WORK, doc.replace(/\.air\.json$/, ""));
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(TEMPLATE)) copyFileSync(join(TEMPLATE, f), join(dir, f));
  for (const [rel, content] of files) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  run("npm", ["ci", "--ignore-scripts"], dir);

  let tscExit = 0;
  let tscOut = "";
  try {
    run("npx", ["tsc", "--noEmit"], dir);
  } catch (e) {
    tscExit = e.status ?? 1;
    tscOut = String(e.stdout ?? "").slice(0, 400);
  }
  log({ doc, emittedFiles: files.size, tscExit, ...(tscOut ? { tscOut } : {}) });
  if (tscExit !== 0) allOk = false;

  if (first && tscExit === 0) {
    first = false;
    let exportExit = 0;
    try {
      run("npx", ["expo", "export", "--platform", "ios", "--platform", "android", "--output-dir", "dist"], dir);
    } catch (e) {
      exportExit = e.status ?? 1;
    }
    const bundles = [];
    for (const plat of ["ios", "android"]) {
      try {
        const d = join(dir, "dist", "_expo", "static", "js", plat);
        bundles.push({ plat, hbc: readdirSync(d).filter((f) => f.endsWith(".hbc")).length });
      } catch {
        bundles.push({ plat, hbc: 0 });
      }
    }
    const ok = exportExit === 0 && bundles.every((b) => b.hbc === 1);
    log({ doc, etape: "expo-export", exportExit, bundles, verdict: ok ? "OK" : "ÉCHEC" });
    if (!ok) allOk = false;
  }
}
log({ verdict: allOk ? "V43 VERTE" : "V43 ÉCHEC" });
process.exitCode = allOk ? 0 : 1;
