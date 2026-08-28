// 4.7 (D-031/ROADMAP) — APP TÉMOIN : le projet COMPILÉ (compileProject,
// artefact officiel 4.6) est écrit tel quel, installé, buildé en Release
// et LANCÉ sur les émulateurs iOS et Android ; parcours Maestro assertant
// l'écran d'entrée, le RENDU DES FIXTURES compilées et une action
// `navigate` réelle + retour. Captures versionnées. 0 $.
// Usage : node v47-app-temoin.mjs <workdir>
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const WORK = process.argv[2];
if (!WORK) throw new Error("usage: node v47-app-temoin.mjs <workdir>");
const { compileProject } = await import(join(REPO, "packages/compiler/src/compile-project.ts"));

const LOG = join(HERE, "results", "v47-app-temoin.jsonl");
mkdirSync(join(HERE, "results"), { recursive: true });
const log = (o) => { appendFileSync(LOG, JSON.stringify(o) + "\n"); console.log(JSON.stringify(o)); };

const air = JSON.parse(
  readFileSync(join(REPO, "packages/golden-corpus/corpus-v2/resto-quartier.air.json"), "utf8"),
);
const compiled = compileProject(air);
const dir = join(WORK, "temoin-resto");
for (const [rel, content] of compiled.files) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content);
}
log({ etape: "ecriture", rootHash: compiled.rootHash, fileCount: compiled.files.size });
const run = (cmd, args, cwd, extraEnv = {}) =>
  execFileSync(cmd, args, {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...extraEnv },
  });
run("npm", ["ci", "--ignore-scripts"], dir);
log({ etape: "npm-ci", ok: true });
console.log("PRET_POUR_BUILDS", dir);
