// PHASE 7 — ÉPREUVES DU CRITÈRE DUR (7.3/7.4, D-035 — ROADMAP) :
//  P1 bout-en-bout : génération pilotée par jobs, 5 étapes réelles
//     (resolve → compile → verify[sandbox §8] → oracle → finalize) ;
//  P2 kill -9 : mort BRUTALE du processus en pleine étape → reprise
//     correcte SANS DOUBLON (artefacts identiques, étapes antérieures non
//     ré-exécutées) — idempotence prouvée ;
//  P3 annulation propre : runs.cancel en cours → étapes suivantes jamais
//     exécutées, statut terminal ;
//  P4 timeout : étape dépassant maxDuration → échec borné, pas d'attente
//     infinie ;
//  P5 état inspectable : statut/étapes/artefacts lisibles par API à tout
//     moment.
// Journaux JSONL versionnés ; aucun secret journalisé.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(HERE, "results"), { recursive: true });
const LOG = join(HERE, "results", `phase7-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
const log = (o) => { appendFileSync(LOG, JSON.stringify(o) + "\n"); console.log(JSON.stringify(o)); };

const env = readFileSync(join(homedir(), ".deribfy-trigger-test.env"), "utf8");
process.env.TRIGGER_SECRET_KEY = env.match(/^TRIGGER_SECRET_KEY=(.+)$/m)[1].trim();
const { tasks, runs } = await import("@trigger.dev/sdk/v3");

const DOC = "resto-quartier";
const stamp = Date.now().toString(36);
const attendre = async (cond, timeoutMs, quoi) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await cond()) return Date.now() - t0;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`timeout d'attente: ${quoi}`);
};
const poll = async (id) => runs.retrieve(id);
const terminal = (s) => ["COMPLETED", "FAILED", "CANCELED", "CRASHED", "TIMED_OUT", "SYSTEM_FAILURE", "EXPIRED"].includes(s);

let echecs = 0;
const epreuve = async (nom, fn) => {
  log({ epreuve: nom, event: "debut" });
  try {
    await fn();
    log({ epreuve: nom, event: "REUSSIE" });
  } catch (e) {
    echecs += 1;
    log({ epreuve: nom, event: "ECHOUEE", detail: String(e?.message ?? e).slice(0, 300) });
  }
};

// ---------- P1 : bout-en-bout piloté par jobs ----------
let refRecords = null;
await epreuve("P1-bout-en-bout", async () => {
  const jobId = `p1-${stamp}`;
  const h = await tasks.trigger("generation-pipeline", { jobId, docId: DOC }, { idempotencyKey: `run-${jobId}` });
  const t0 = Date.now();
  await attendre(async () => terminal((await poll(h.id)).status), 900_000, "fin du pipeline P1");
  const r = await poll(h.id);
  const out = r.output;
  log({ epreuve: "P1-bout-en-bout", event: "mesures", status: r.status, dureeMs: Date.now() - t0, etapes: out?.records?.map((x) => x.step), artefacts: out?.records?.map((x) => x.artifact.slice(0, 12)) });
  if (r.status !== "COMPLETED" || out?.status !== "done" || out?.records?.length !== 5) {
    throw new Error(`pipeline non complété: ${r.status}/${out?.status}`);
  }
  refRecords = out.records;
});

// ---------- P2 : kill -9 en pleine étape → reprise sans doublon ----------
await epreuve("P2-kill9-idempotence", async () => {
  const jobId = `p2-${stamp}`;
  const h = await tasks.trigger(
    "generation-pipeline",
    { jobId, docId: DOC, crashOnceAt: "compile" },
    { idempotencyKey: `run-${jobId}` },
  );
  const t0 = Date.now();
  await attendre(async () => terminal((await poll(h.id)).status), 900_000, "fin du pipeline P2");
  const r = await poll(h.id);
  const out = r.output;
  const compileRec = out?.records?.find((x) => x.step === "compile");
  log({
    epreuve: "P2-kill9-idempotence",
    event: "mesures",
    status: r.status,
    dureeMs: Date.now() - t0,
    tentatives_compile: compileRec?.attempts,
    etapes: out?.records?.map((x) => x.step),
    artefacts_identiques_a_P1: refRecords
      ? JSON.stringify(out?.records?.map((x) => x.artifact)) === JSON.stringify(refRecords.map((x) => x.artifact))
      : null,
  });
  if (r.status !== "COMPLETED" || out?.status !== "done") throw new Error(`reprise échouée: ${r.status}`);
  if (!(compileRec?.attempts >= 2)) throw new Error("l'étape n'a pas été REPRISE après la mort du processus");
  // Sans doublon : mêmes artefacts que le run de référence, 5 étapes une seule fois.
  if (out.records.length !== 5) throw new Error("doublon d'étapes détecté");
  if (refRecords && JSON.stringify(out.records.map((x) => x.artifact)) !== JSON.stringify(refRecords.map((x) => x.artifact))) {
    throw new Error("artefacts différents après reprise (non-déterminisme)");
  }
});

// ---------- P3 : annulation propre ----------
await epreuve("P3-annulation", async () => {
  const jobId = `p3-${stamp}`;
  const h = await tasks.trigger("generation-pipeline", { jobId, docId: DOC }, { idempotencyKey: `run-${jobId}` });
  // Laisser démarrer, puis annuler pendant l'exécution.
  await attendre(async () => ["EXECUTING", "COMPLETED", "FAILED"].includes((await poll(h.id)).status), 180_000, "démarrage P3");
  await runs.cancel(h.id);
  await attendre(async () => terminal((await poll(h.id)).status), 300_000, "statut terminal P3");
  const r = await poll(h.id);
  log({ epreuve: "P3-annulation", event: "mesures", status: r.status });
  if (r.status !== "CANCELED") throw new Error(`statut attendu CANCELED, obtenu ${r.status}`);
});

// ---------- P4 : timeout borné ----------
await epreuve("P4-timeout", async () => {
  const jobId = `p4-${stamp}`;
  const h = await tasks.trigger(
    "generation-pipeline",
    { jobId, docId: DOC, sleepMsAt: { step: "resolve", ms: 700_000 } },
    { idempotencyKey: `run-${jobId}` },
  );
  const t0 = Date.now();
  await attendre(async () => terminal((await poll(h.id)).status), 900_000, "statut terminal P4");
  const r = await poll(h.id);
  // CORRECTION (cause démontrée 2026-08-28) : le critère « timeouts » porte
  // sur le comportement MÉTIER — job borné, échec propre, aucun artefact —
  // et non sur le statut du RUN d'orchestration (le parent se termine
  // normalement en RETOURNANT un verdict d'échec, il ne lève pas).
  const metier = r.output;
  log({
    epreuve: "P4-timeout",
    event: "mesures",
    runStatus: r.status,
    statutMetier: metier?.status,
    etapeEnEchec: metier?.failedStep,
    artefactsProduits: metier?.records?.length,
    dureeMs: Date.now() - t0,
  });
  if (metier?.status !== "failed") throw new Error(`job non borné : statut métier ${metier?.status}`);
  if (metier?.failedStep !== "resolve") throw new Error("étape en échec inattendue");
  if ((metier?.records?.length ?? -1) !== 0) throw new Error("des artefacts ont été produits malgré le timeout");
  if (Date.now() - t0 > 800_000) throw new Error("borne de temps non respectée");
});

// ---------- P5 : état inspectable ----------
await epreuve("P5-etat-inspectable", async () => {
  const jobId = `p5-${stamp}`;
  const h = await tasks.trigger("generation-pipeline", { jobId, docId: DOC }, { idempotencyKey: `run-${jobId}` });
  const snapshots = [];
  for (let i = 0; i < 5; i += 1) {
    const r = await poll(h.id);
    snapshots.push({ status: r.status, hasOutput: r.output !== undefined });
    if (terminal(r.status)) break;
    await new Promise((res) => setTimeout(res, 8000));
  }
  await attendre(async () => terminal((await poll(h.id)).status), 900_000, "fin P5");
  const fin = await poll(h.id);
  log({
    epreuve: "P5-etat-inspectable",
    event: "mesures",
    instantanes: snapshots,
    statutFinal: fin.status,
    etapesLisibles: fin.output?.records?.map((x) => `${x.step}:${x.artifact.slice(0, 8)}`),
  });
  if (snapshots.length < 2) throw new Error("état non observable en cours d'exécution");
  if (fin.status !== "COMPLETED") throw new Error(`fin inattendue: ${fin.status}`);
});

log({ RESUME: `${5 - echecs}/5 épreuves réussies`, journal: LOG });
process.exitCode = echecs === 0 ? 0 : 1;
