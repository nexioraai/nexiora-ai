// TÂCHES DURABLES DU PIPELINE DE GÉNÉRATION (7.2/7.3, D-035 — §14).
// L'ADAPTATEUR : il exécute le plan défini par `@deribfy/workflow` (machine
// à états PURE, agnostique du moteur). Les étapes appellent le VRAI moteur
// (résolveur, compilateur, Oracle) et la VRAIE sandbox (§8, Modal via le
// contrat provider-agnostic). Toute la durabilité — file, retries, reprise
// après mort du worker, dédup par idempotencyKey, annulation, timeouts —
// est déléguée au moteur choisi (D-016).
// Idempotence : clé DÉTERMINISTE par (job, étape, airHash) issue du cœur.
import { task } from "@trigger.dev/sdk/v3";
import {
  PIPELINE_STEPS,
  idempotencyKey,
  type StepName,
} from "../../../packages/workflow/src/index.ts";
import { resolveLock } from "../../../packages/compiler/src/resolve-lock.ts";
import { compileProject } from "../../../packages/compiler/src/compile-project.ts";
import { runOracleLevel1 } from "../../../packages/oracle/src/index.ts";
import { canonicalJson, sha256Hex } from "../../../packages/air-schema/src/canonical.ts";
import { runPipeline, defaultPipeline } from "../../../packages/sandbox/src/index.ts";
import { ModalSandboxProvider } from "../modal-provider.ts";
import { CORPUS } from "../corpus.ts";

interface StepPayload {
  jobId: string;
  step: StepName;
  docId: string;
  airHash: string;
  /** Épreuves du critère dur : mort brutale UNE fois à cette étape. */
  crashOnceAt?: StepName;
  /** Épreuve timeout : dormir au-delà du maxDuration de l'étape. */
  sleepMsAt?: { step: StepName; ms: number };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Mémoire de crash inter-tentatives : le run parent transmet l'état ; ici
// on utilise le compteur de tentatives du moteur (fourni par le contexte)
// — l'épreuve E1 vérifie que l'étape reprend et se termine.
export const generationStep = task({
  id: "generation-step",
  retry: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 5000, factor: 1.5, randomize: false },
  maxDuration: 600,
  run: async (p: StepPayload, { ctx }) => {
    const air = CORPUS[p.docId];
    if (air === undefined) throw new Error(`document inconnu: ${p.docId}`);

    // Épreuve TIMEOUT (7.4) : dépasse volontairement maxDuration.
    if (p.sleepMsAt?.step === p.step) {
      await sleep(p.sleepMsAt.ms);
    }

    // Épreuve KILL -9 (7.4) : mort BRUTALE du processus en pleine étape, à
    // la PREMIÈRE tentative seulement (attempt fourni par le moteur).
    if (p.crashOnceAt === p.step && ctx.attempt.number === 1) {
      process.exit(1);
    }

    switch (p.step) {
      case "resolve": {
        const lock = resolveLock(air);
        return { step: p.step, artifact: sha256Hex(canonicalJson(lock)), attempts: ctx.attempt.number };
      }
      case "compile": {
        const compiled = compileProject(air);
        return { step: p.step, artifact: compiled.rootHash, attempts: ctx.attempt.number };
      }
      case "verify": {
        // Pipeline §8 dans la sandbox, via le contrat PROVIDER-AGNOSTIC.
        const compiled = compileProject(air);
        const provider = await ModalSandboxProvider.connect();
        const files = await provider.packProject(compiled.files);
        const report = await runPipeline(
          provider,
          {
            label: `job-${p.jobId}`,
            network: { mode: "allowlist", domains: ["registry.npmjs.org", "*.npmjs.org"] },
            vcpu: 2,
            memoryMiB: 4096,
            timeoutMs: 480_000,
          },
          files,
          [
            { name: "extract", command: "mkdir -p /tmp/build && tar xzf /tmp/fixture.tgz -C /tmp/build" },
            ...defaultPipeline("/tmp/build"),
          ],
        );
        if (!report.ok || !report.teardownProved) {
          throw new Error(`pipeline sandbox échoué: ${report.failedStep ?? "teardown"}`);
        }
        return {
          step: p.step,
          artifact: sha256Hex(canonicalJson({ ok: report.ok, steps: report.steps.map((s) => s.name) })),
          attempts: ctx.attempt.number,
        };
      }
      case "oracle": {
        const compiled = compileProject(air);
        const verdict = runOracleLevel1(air, compiled.rootHash);
        if (!verdict.passed) throw new Error("Oracle L1 refuse le résultat");
        return { step: p.step, artifact: sha256Hex(canonicalJson(verdict)), attempts: ctx.attempt.number };
      }
      case "finalize": {
        return { step: p.step, artifact: p.airHash, attempts: ctx.attempt.number };
      }
      default:
        throw new Error(`étape inconnue: ${String(p.step)}`);
    }
  },
});

export const generationPipeline = task({
  id: "generation-pipeline",
  retry: { maxAttempts: 1 },
  maxDuration: 900,
  run: async (p: {
    jobId: string;
    docId: string;
    crashOnceAt?: StepName;
    sleepMsAt?: { step: StepName; ms: number };
  }) => {
    const air = CORPUS[p.docId];
    if (air === undefined) throw new Error(`document inconnu: ${p.docId}`);
    const airHash = sha256Hex(canonicalJson(air));
    const records: { step: StepName; artifact: string; attempts: number }[] = [];

    for (const step of PIPELINE_STEPS) {
      const r = await generationStep.triggerAndWait(
        { jobId: p.jobId, step, docId: p.docId, airHash, crashOnceAt: p.crashOnceAt, sleepMsAt: p.sleepMsAt },
        // Clé d'idempotence DÉTERMINISTE du cœur : un rejeu ne ré-exécute
        // jamais une étape déjà terminée (pas de doublon).
        { idempotencyKey: idempotencyKey(p.jobId, step, airHash) },
      );
      if (!r.ok) {
        return { jobId: p.jobId, status: "failed" as const, failedStep: step, records, airHash };
      }
      records.push(r.output as { step: StepName; artifact: string; attempts: number });
    }
    return { jobId: p.jobId, status: "done" as const, failedStep: null, records, airHash };
  },
});
