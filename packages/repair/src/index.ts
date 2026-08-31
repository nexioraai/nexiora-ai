// @deribfy/repair — Repair Loop v1 (Phase 9, ARCHITECTURE §10).
// Cœur PUR : ports injectés (auteur LLM, juge Oracle, simulateur
// compilateur), aucune dépendance à un moteur ni à un fournisseur.
export {
  REPAIR_CLASSES,
  REPAIR_STAGES,
  RepairContractError,
} from "./contracts.ts";
export type {
  ApxxSnapshot,
  ApxxState,
  Diagnosis,
  DiagnosisTarget,
  FailureCheck,
  FailureSignal,
  ImpactAnalysis,
  RepairAuthor,
  RepairAuthorContext,
  RepairClass,
  RepairEvent,
  RepairOutcome,
  RepairProposal,
  RepairSimulator,
  RepairStage,
  RepairState,
  RepairStatus,
  RepairVerifier,
  SimulationResult,
  SlotSource,
  VerificationReport,
} from "./contracts.ts";
export { EMPTY_LEDGER, assertBudget, canAttempt, isExhausted, spend } from "./budget.ts";
export type { BudgetLedger, RepairBudget } from "./budget.ts";
export { diagnose } from "./diagnose.ts";
export { apxxRegressions, runRepairLoop } from "./loop.ts";
export type { RepairInput } from "./loop.ts";
