// @deribfy/workflow — machine à états du pipeline (Phase 7, D-035).
// AUCUN SDK d'orchestrateur ici (cliquet engine-agnostic) : les
// adaptateurs (Trigger.dev, D-016) vivent hors du cœur.
export {
  PIPELINE_STEPS,
  WorkflowError,
  applyStepResult,
  canTransition,
  cancelJob,
  describeJobState,
  idempotencyKey,
  nextStep,
  startJob,
  timeoutJob,
} from "./state-machine.ts";
export type { JobState, JobStatus, StepName, StepRecord } from "./state-machine.ts";
