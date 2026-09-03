// Rejeu ciblé P1 (bout-en-bout) + P2 (kill -9 / idempotence) après la
// correction Safe Area du générateur : les artefacts changent, les
// preuves antérieures ne valent plus.
import { appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const LOG = join(HERE, "results", "phase7-rejeu-postfix.jsonl");
const log = (o) => { appendFileSync(LOG, JSON.stringify(o) + "\n"); console.log(JSON.stringify(o)); };
process.env.TRIGGER_SECRET_KEY = readFileSync(join(homedir(), ".deribfy-trigger-test.env"), "utf8").match(/^TRIGGER_SECRET_KEY=(.+)$/m)[1].trim();
const { tasks, runs } = await import("@trigger.dev/sdk/v3");
const terminal = (s) => ["COMPLETED","FAILED","CANCELED","CRASHED","TIMED_OUT","SYSTEM_FAILURE","EXPIRED"].includes(s);
const wait = async (id, ms=900000) => { const t0=Date.now(); while(Date.now()-t0<ms){ const r=await runs.retrieve(id); if(terminal(r.status)) return r; await new Promise(x=>setTimeout(x,5000)); } throw new Error("timeout"); };
const st = Date.now().toString(36);
const h1 = await tasks.trigger("generation-pipeline", { jobId:`r1-${st}`, docId:"resto-quartier" }, { idempotencyKey:`run-r1-${st}` });
const r1 = await wait(h1.id);
const ref = r1.output?.records?.map(x=>x.artifact);
log({ epreuve:"P1-rejeu", status:r1.status, metier:r1.output?.status, etapes:r1.output?.records?.length, artefacts:ref?.map(a=>a.slice(0,12)) });
const h2 = await tasks.trigger("generation-pipeline", { jobId:`r2-${st}`, docId:"resto-quartier", crashOnceAt:"compile" }, { idempotencyKey:`run-r2-${st}` });
const r2 = await wait(h2.id);
const c = r2.output?.records?.find(x=>x.step==="compile");
const identiques = JSON.stringify(r2.output?.records?.map(x=>x.artifact)) === JSON.stringify(ref);
log({ epreuve:"P2-rejeu-kill9", status:r2.status, metier:r2.output?.status, tentatives_compile:c?.attempts, etapes:r2.output?.records?.length, artefacts_identiques_a_P1:identiques });
const ok = r1.status==="COMPLETED" && r1.output?.status==="done" && r1.output?.records?.length===5 && r2.status==="COMPLETED" && r2.output?.status==="done" && c?.attempts>=2 && r2.output?.records?.length===5 && identiques;
log({ VERDICT: ok ? "PHASE 7 REJEU : VERT (bout-en-bout + kill-9 sans doublon)" : "ÉCHEC" });
process.exitCode = ok ? 0 : 1;
