// V2 (4.0, D-026) — PILOTE : 10 invocations de PROCESSUS DISTINCTES du
// probe d'empaquetage × 2 environnements (A : environnement courant ·
// B : TZ/locale/NODE_ICU différents + cwd différent), sur le document du
// corpus ACTIF (v2). Attendu : 20/20 hash racine identiques.
// Journal JSONL versionné dans results/.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PROBE = join(HERE, "v2-empaquetage.mjs");
const DOC = join(
  REPO,
  "packages/golden-corpus/corpus-v2",
  process.argv[2] ?? "agence-immo.air.json",
);

const ENVS = {
  A: { ...process.env },
  B: {
    ...process.env,
    TZ: "Pacific/Auckland",
    LANG: "tr_TR.UTF-8", // locale turque : piège classique de casse (i/İ)
    LC_ALL: "tr_TR.UTF-8",
  },
};
const CWDS = { A: REPO, B: tmpdir() };

mkdirSync(join(HERE, "results"), { recursive: true });
const log = join(HERE, "results", `v2-${process.argv[2] ?? "agence-immo"}.jsonl`);

const roots = new Set();
for (const envName of ["A", "B"]) {
  for (let run = 1; run <= 10; run++) {
    const out = execFileSync(process.execPath, [PROBE, DOC], {
      env: ENVS[envName],
      cwd: CWDS[envName],
      encoding: "utf8",
    });
    const { root, fileCount } = JSON.parse(out.trim());
    roots.add(root);
    appendFileSync(log, JSON.stringify({ envName, run, fileCount, root }) + "\n");
  }
}

const verdict = roots.size === 1 ? "IDENTIQUE 20/20" : `DIVERGENCE (${roots.size} hashes)`;
appendFileSync(log, JSON.stringify({ verdict, distinct: [...roots] }) + "\n");
console.log(verdict, [...roots]);
process.exitCode = roots.size === 1 ? 0 : 1;
