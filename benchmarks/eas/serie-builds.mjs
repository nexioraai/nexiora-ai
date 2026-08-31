// BANC « COÛTS EAS » — VOLET 2 (Phase 1, protocole `couts-unitaires.md`) :
// « durée de build iOS et Android (froid, puis avec cache activé), file
// d'attente, $ par build au tarif public, builds/mois inclus par palier.
// 5 builds par plateforme minimum. »
// Série exécutée sur le projet du slice restaurant à son état COURANT
// (code corrigé D-037), palier Free → 0 $. Journal JSONL versionné.
// Aucun secret journalisé.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..", "..", "slices", "restaurant", "app");
mkdirSync(join(HERE, "results"), { recursive: true });
const LOG = join(HERE, "results", "serie-eas.jsonl");
const log = (o) => { appendFileSync(LOG, JSON.stringify(o) + "\n"); console.log(JSON.stringify(o)); };

const token = readFileSync(join(homedir(), ".deribfy-sandbox-bench.env"), "utf8")
  .match(/^EXPO_TOKEN=(.+)$/m)?.[1]?.trim();
if (!token) throw new Error("EXPO_TOKEN absent");
const env = { ...process.env, EXPO_TOKEN: token, PATH: `${homedir()}/.npm-global/bin:${process.env.PATH}` };
const eas = (args) => execFileSync("eas", args, { cwd: APP, env, encoding: "utf8" });

const N = Number(process.argv[2] ?? 5);
const PLATS = [
  { plat: "android", profil: "preview" },
  { plat: "ios", profil: "preview-simulator" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const terminal = (s) => ["FINISHED", "ERRORED", "CANCELED"].includes(s);

for (const { plat, profil } of PLATS) {
  for (let i = 1; i <= N; i += 1) {
    const tSubmit = Date.now();
    let id;
    try {
      const out = eas(["build", "--platform", plat, "--profile", profil, "--non-interactive", "--no-wait"]);
      id = /builds\/([0-9a-f-]{36})/.exec(out)?.[1];
    } catch (e) {
      log({ plat, run: i, ERREUR: String(e.message).slice(0, 200) });
      continue;
    }
    const submitMs = Date.now() - tSubmit;
    if (id === undefined) { log({ plat, run: i, ERREUR: "id de build introuvable" }); continue; }

    // Attente du statut terminal + relevé des horodatages serveur.
    let info;
    const t0 = Date.now();
    while (Date.now() - t0 < 3_600_000) {
      const j = JSON.parse(eas(["build:view", id, "--json"]));
      if (terminal(j.status)) { info = j; break; }
      await sleep(30_000);
    }
    if (info === undefined) { log({ plat, run: i, ERREUR: "timeout d'attente" }); continue; }

    const created = Date.parse(info.createdAt);
    const started = info.initiatingActor && info.metrics?.buildStartTimestamp
      ? Number(info.metrics.buildStartTimestamp) : null;
    const completed = Date.parse(info.completedAt);
    log({
      banc: "couts-EAS volet 2",
      plat,
      profil,
      run: i,
      froid: i === 1,
      soumissionMs: submitMs,
      dureeTotaleS: Math.round((completed - created) / 1000),
      fileAttenteS: started !== null ? Math.round((started - created) / 1000) : null,
      statut: info.status,
      artefact: Boolean(info.artifacts?.buildUrl),
      coutUsd: 0,
      palier: "Free",
    });
  }
}
log({ fin: true, journal: LOG });
