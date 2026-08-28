// MACHINE À ÉTATS (7.1) — propriétés du critère dur PROUVÉES en pur :
// idempotence (rejeu sans doublon), reprise au bon point, transitions
// fail-closed, annulation/timeout terminaux, état inspectable,
// détection de non-déterminisme.
import { describe, expect, it } from "vitest";
import {
  PIPELINE_STEPS,
  WorkflowError,
  applyStepResult,
  cancelJob,
  canTransition,
  describeJobState,
  idempotencyKey,
  nextStep,
  startJob,
  timeoutJob,
} from "../src/index.ts";
import type { JobState, StepRecord } from "../src/index.ts";

const AIR = "a".repeat(64);
const rec = (step: (typeof PIPELINE_STEPS)[number], ok = true, artifact = "art-" + step): StepRecord => ({
  step, ok, artifact, attempts: 1,
});

describe("clés d'idempotence", () => {
  it("déterministes : mêmes entrées ⇒ même clé, sans horodatage ni aléa", () => {
    const a = idempotencyKey("job1", "compile", AIR);
    const b = idempotencyKey("job1", "compile", AIR);
    expect(a).toBe(b);
    expect(a).not.toContain(new Date().getFullYear().toString());
  });
  it("distinctes par étape, par job et par AIR", () => {
    const keys = new Set([
      idempotencyKey("job1", "compile", AIR),
      idempotencyKey("job1", "verify", AIR),
      idempotencyKey("job2", "compile", AIR),
      idempotencyKey("job1", "compile", "b".repeat(64)),
    ]);
    expect(keys.size).toBe(4);
  });
});

describe("progression et reprise", () => {
  it("ordre du pipeline respecté", () => {
    let s = startJob("j", AIR);
    const seen: string[] = [];
    for (const _unused of PIPELINE_STEPS) {
      void _unused;
      const step = nextStep(s);
      expect(step).not.toBeNull();
      if (step === null) throw new Error("étape manquante");
      seen.push(step);
      s = applyStepResult(s, rec(step));
    }
    expect(seen).toEqual([...PIPELINE_STEPS]);
    expect(nextStep(s)).toBeNull();
    expect(s.status).toBe("done");
  });

  it("REPRISE : après crash au milieu, repart exactement à l'étape suivante", () => {
    let s = startJob("j", AIR);
    s = applyStepResult(s, rec("resolve"));
    s = applyStepResult(s, rec("compile"));
    // « crash » : l'état est rechargé tel quel (durable)
    const reloaded: JobState = JSON.parse(JSON.stringify(s)) as JobState;
    expect(nextStep(reloaded)).toBe("verify");
    expect(describeJobState(reloaded).progress).toBe("2/5");
  });

  it("IDEMPOTENCE : rejouer une étape réussie ne duplique rien", () => {
    let s = startJob("j", AIR);
    s = applyStepResult(s, rec("resolve"));
    const before = JSON.stringify(s);
    s = applyStepResult(s, rec("resolve"));
    s = applyStepResult(s, rec("resolve"));
    expect(JSON.stringify(s)).toBe(before);
    expect(s.completed.filter((c) => c.step === "resolve")).toHaveLength(1);
  });

  it("détecte un NON-DÉTERMINISME (même étape, artefact différent)", () => {
    let s = startJob("j", AIR);
    s = applyStepResult(s, rec("compile", true, "hash-A"));
    expect(() => applyStepResult(s, rec("compile", true, "hash-B"))).toThrow(WorkflowError);
  });

  it("échec d'étape ⇒ statut failed, pipeline arrêté", () => {
    let s = startJob("j", AIR);
    s = applyStepResult(s, rec("resolve"));
    s = applyStepResult(s, rec("compile", false, ""));
    expect(s.status).toBe("failed");
    expect(nextStep(s)).toBeNull();
  });
});

describe("annulation, timeout, transitions fail-closed", () => {
  it("annulation : terminale, aucune étape tardive ne ressuscite le job", () => {
    let s = applyStepResult(startJob("j", AIR), rec("resolve"));
    s = cancelJob(s);
    expect(s.status).toBe("cancelled");
    expect(nextStep(s)).toBeNull();
    const after = applyStepResult(s, rec("compile"));
    expect(after.status).toBe("cancelled");
    expect(after.completed.some((c) => c.step === "compile")).toBe(false);
  });

  it("timeout : terminal", () => {
    const s = timeoutJob(applyStepResult(startJob("j", AIR), rec("resolve")));
    expect(s.status).toBe("timed_out");
    expect(nextStep(s)).toBeNull();
  });

  it("transitions illégales refusées (fail-closed)", () => {
    expect(canTransition("done", "running")).toBe(false);
    expect(canTransition("cancelled", "running")).toBe(false);
    const done = { jobId: "j", airHash: AIR, status: "done" as const, completed: [] };
    expect(() => cancelJob(done)).toThrow(WorkflowError);
  });
});

describe("état inspectable", () => {
  it("instantané complet : statut, progression, prochaine étape, étapes", () => {
    let s = startJob("job-x", AIR);
    s = applyStepResult(s, rec("resolve"));
    const d = describeJobState(s);
    expect(d).toMatchObject({ jobId: "job-x", status: "running", progress: "1/5", nextStep: "compile" });
    expect(d.steps).toHaveLength(1);
  });
});
