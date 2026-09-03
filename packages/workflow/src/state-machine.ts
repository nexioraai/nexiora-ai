// MACHINE À ÉTATS DU PIPELINE DE GÉNÉRATION (7.1, D-035 — ARCHITECTURE
// §14). PURE et AGNOSTIQUE DU MOTEUR : elle décrit les étapes, l'ordre,
// les transitions légales et les CLÉS D'IDEMPOTENCE ; elle n'importe
// aucun SDK d'orchestrateur (cliquet). Trigger.dev (D-016) — ou un autre
// moteur demain — n'est qu'un adaptateur qui exécute ce plan.
// Propriétés visées par le critère dur de la Phase 7 :
//  - idempotence : chaque étape a une clé DÉTERMINISTE dérivée de
//    (jobId, étape, airHash) → un rejeu ne produit jamais de doublon ;
//  - reprise : l'état est reconstructible depuis les étapes terminées ;
//  - annulation/timeout : états terminaux explicites ;
//  - état inspectable : `describeJobState` retourne un instantané complet.

export const PIPELINE_STEPS = [
  "resolve", // AIR → project.lock (fail-closed, 4 validateurs)
  "compile", // lock+AIR → projet complet + rootHash (déterministe)
  "verify", // pipeline §8 dans la sandbox (install/typecheck/bundle)
  "oracle", // Oracle L1 déterministe sur les artefacts
  "finalize", // scellement de l'état final
] as const;

export type StepName = (typeof PIPELINE_STEPS)[number];

export type JobStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "cancelled"
  | "timed_out";

export interface StepRecord {
  readonly step: StepName;
  readonly ok: boolean;
  /** Empreinte de l'artefact produit (hash) — vide si l'étape n'en produit pas. */
  readonly artifact: string;
  readonly attempts: number;
}

export interface JobState {
  readonly jobId: string;
  readonly airHash: string;
  readonly status: JobStatus;
  readonly completed: readonly StepRecord[];
}

export class WorkflowError extends Error {
  readonly code: string;

  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "WorkflowError";
    this.code = code;
  }
}

/**
 * Clé d'idempotence DÉTERMINISTE d'une étape. Même job + même AIR + même
 * étape ⇒ même clé ⇒ le moteur (quel qu'il soit) déduplique. Ne contient
 * ni horodatage ni aléa (rejouabilité).
 */
export function idempotencyKey(jobId: string, step: StepName, airHash: string): string {
  return `${jobId}:${step}:${airHash.slice(0, 16)}`;
}

/** Étape suivante à exécuter, ou null si le pipeline est terminé. */
export function nextStep(state: JobState): StepName | null {
  if (state.status === "cancelled" || state.status === "failed" || state.status === "timed_out") {
    return null;
  }
  const doneNames = new Set(state.completed.filter((s) => s.ok).map((s) => s.step));
  for (const step of PIPELINE_STEPS) {
    if (!doneNames.has(step)) return step;
  }
  return null;
}

/** Transitions légales (fail-closed : toute autre transition est refusée). */
const LEGAL: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  pending: ["running", "cancelled"],
  running: ["running", "done", "failed", "cancelled", "timed_out"],
  done: [],
  failed: [],
  cancelled: [],
  timed_out: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return LEGAL[from].includes(to);
}

/**
 * Applique le résultat d'une étape. IDEMPOTENT : ré-appliquer une étape
 * déjà réussie ne duplique rien et ne change pas l'état (propriété clé du
 * critère dur — un rejeu après crash retombe exactement au même point).
 */
export function applyStepResult(state: JobState, record: StepRecord): JobState {
  if (state.status === "cancelled" || state.status === "timed_out") {
    // Terminal : un résultat tardif d'étape ne ressuscite jamais un job.
    return state;
  }
  const already = state.completed.find((s) => s.step === record.step && s.ok);
  if (already !== undefined) {
    if (record.ok && record.artifact !== already.artifact) {
      // Non-déterminisme détecté : même étape, artefact différent.
      throw new WorkflowError(
        "WF_NONDETERMINISM",
        `${record.step}: artefact ${record.artifact.slice(0, 12)} ≠ ${already.artifact.slice(0, 12)}`,
      );
    }
    return state; // rejeu d'une étape réussie : aucun effet (idempotence)
  }
  const completed = [...state.completed.filter((s) => s.step !== record.step), record];
  const ordered = PIPELINE_STEPS.flatMap((s) => completed.filter((c) => c.step === s));
  if (!record.ok) {
    return { ...state, status: "failed", completed: ordered };
  }
  const allDone = PIPELINE_STEPS.every((s) => ordered.some((c) => c.step === s && c.ok));
  return { ...state, status: allDone ? "done" : "running", completed: ordered };
}

export function startJob(jobId: string, airHash: string): JobState {
  return { jobId, airHash, status: "pending", completed: [] };
}

export function cancelJob(state: JobState): JobState {
  if (!canTransition(state.status, "cancelled")) {
    throw new WorkflowError("WF_ILLEGAL_TRANSITION", `${state.status} → cancelled`);
  }
  return { ...state, status: "cancelled" };
}

export function timeoutJob(state: JobState): JobState {
  if (!canTransition(state.status, "timed_out")) {
    throw new WorkflowError("WF_ILLEGAL_TRANSITION", `${state.status} → timed_out`);
  }
  return { ...state, status: "timed_out" };
}

/** ÉTAT INSPECTABLE (critère dur) : instantané complet et lisible. */
export function describeJobState(state: JobState): {
  jobId: string;
  status: JobStatus;
  progress: string;
  nextStep: StepName | null;
  steps: readonly { step: StepName; ok: boolean; attempts: number; artifact: string }[];
} {
  const done = state.completed.filter((s) => s.ok).length;
  return {
    jobId: state.jobId,
    status: state.status,
    progress: `${done}/${PIPELINE_STEPS.length}`,
    nextStep: nextStep(state),
    steps: state.completed.map((s) => ({
      step: s.step,
      ok: s.ok,
      attempts: s.attempts,
      artifact: s.artifact,
    })),
  };
}
