// 4.6 (D-031) — PREUVE OFFICIELLE DU CRITÈRE DUR DE LA PHASE 4 :
// « sur tout le golden corpus [ACTIF v2], 10 compilations successives →
// hash de sortie identique 10/10 ; artefacts au store SHA-256 ; aucun
// appel LLM dans le chemin de compilation (prouvé par instrumentation) ».
//  - 12 documents × 10 compilations, chacune dans un PROCESSUS SÉPARÉ,
//    environnements alternés (A standard / B TZ Auckland + locale turque),
//    TOUTES sous le harnais zéro-réseau V5 (--import) : la moindre
//    tentative réseau tue la compilation ; ATTEMPTS vérifié = 0 partout.
//  - Chaque projet compilé est rangé au store local content-addressed ;
//    round-trip manifeste vérifié.
// Journal : results/v46-critere-dur.jsonl. 0 $.
// Usage : node v46-critere-dur.mjs <storeDir>
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CORPUS = join(REPO, "packages", "golden-corpus", "corpus-v2");
const PRELOAD = join(HERE, "v5-zero-reseau-preload.mjs");
const WORKER = join(HERE, "v46-worker.mjs");
const storeDir = process.argv[2];
if (!storeDir) throw new Error("usage: node v46-critere-dur.mjs <storeDir>");

const LOG = join(HERE, "results", "v46-critere-dur.jsonl");
mkdirSync(join(HERE, "results"), { recursive: true });
const log = (o) => { appendFileSync(LOG, JSON.stringify(o) + "\n"); console.log(JSON.stringify(o)); };

const ENVB = { TZ: "Pacific/Auckland", LANG: "tr_TR.UTF-8", LC_ALL: "tr_TR.UTF-8" };
const docs = readdirSync(CORPUS).filter((f) => f.endsWith(".air.json")).sort();
let allOk = true;
for (const doc of docs) {
  const hashes = new Set();
  let attempts = 0;
  for (let run = 1; run <= 10; run += 1) {
    const env = run % 2 === 0 ? { ...process.env, ...ENVB } : { ...process.env };
    const r = spawnSync(
      process.execPath,
      ["--import", PRELOAD, WORKER, join(CORPUS, doc), storeDir],
      { env, encoding: "utf8" },
    );
    if (r.status !== 0) {
      log({ doc, run, echec: (r.stderr ?? "").slice(0, 300) });
      allOk = false;
      continue;
    }
    const result = JSON.parse(r.stdout.trim());
    hashes.add(result.rootHash);
    if (!result.storeOk) allOk = false;
    // Instrumentation du harnais V5 (stderr) : DOIT valoir 0.
    const m = /V5_NETWORK_FORBIDDEN_ATTEMPTS=(\d+)/.exec(r.stderr ?? "");
    attempts += m ? Number(m[1]) : 0;
    if (m === null) allOk = false; // harnais absent = preuve invalide.
  }
  const ok = hashes.size === 1 && attempts === 0;
  if (!ok) allOk = false;
  log({ doc, runs: 10, distinctHashes: hashes.size, rootHash: [...hashes][0], attempts, verdict: ok ? "10/10 IDENTIQUES" : "DIVERGENCE" });
}
log({ verdict: allOk ? "CRITÈRE DUR : VERT 12/12" : "ÉCHEC" });
process.exitCode = allOk ? 0 : 1;
