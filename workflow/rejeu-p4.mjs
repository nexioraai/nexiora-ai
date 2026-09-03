// Rejeu CIBLÉ de P4 après correction de l'épreuve (cause démontrée : le
// test assertait le statut du run au lieu du statut métier).
import { appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const LOG = join(HERE, "results", "phase7-P4-rejeu.jsonl");
const log = (o) => { appendFileSync(LOG, JSON.stringify(o) + "\n"); console.log(JSON.stringify(o)); };
process.env.TRIGGER_SECRET_KEY = readFileSync(join(homedir(), ".deribfy-trigger-test.env"), "utf8").match(/^TRIGGER_SECRET_KEY=(.+)$/m)[1].trim();
const { tasks, runs } = await import("@trigger.dev/sdk/v3");
const terminal = (s) => ["COMPLETED","FAILED","CANCELED","CRASHED","TIMED_OUT","SYSTEM_FAILURE","EXPIRED"].includes(s);
const jobId = `p4r-${Date.now().toString(36)}`;
const t0 = Date.now();
const h = await tasks.trigger("generation-pipeline", { jobId, docId: "resto-quartier", sleepMsAt: { step: "resolve", ms: 700_000 } }, { idempotencyKey: `run-${jobId}` });
log({ epreuve: "P4-timeout-rejeu", event: "debut", runId: h.id });
while (Date.now() - t0 < 900_000) {
  const r = await runs.retrieve(h.id);
  if (terminal(r.status)) {
    const m = r.output;
    const ok = m?.status === "failed" && m?.failedStep === "resolve" && (m?.records?.length ?? -1) === 0 && Date.now() - t0 <= 800_000;
    log({ epreuve: "P4-timeout-rejeu", event: "mesures", runStatus: r.status, statutMetier: m?.status, etapeEnEchec: m?.failedStep, artefactsProduits: m?.records?.length, dureeMs: Date.now() - t0 });
    log({ epreuve: "P4-timeout-rejeu", event: ok ? "REUSSIE" : "ECHOUEE" });
    process.exit(ok ? 0 : 1);
  }
  await new Promise((r2) => setTimeout(r2, 5000));
}
log({ epreuve: "P4-timeout-rejeu", event: "ECHOUEE", detail: "aucun statut terminal en 900 s" });
process.exit(1);
