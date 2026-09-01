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
export {
  SECTION_KEYS,
  SECTIONS_CORRECTIVES,
  sectionDuChemin,
  sectionsAReemettre,
  identifiantsDuDocument,
  amputations,
  amputationsHorsPerimetre,
  denaturationsHorsPerimetre,
  mutationsHorsPerimetre,
  perimetreDeReparation,
  signaturesDuDocument,
  type SectionEmission,
  type DiagnosticLike,
  type Amputation,
  type Denaturation,
  type MutationStructurelle,
  type PerimetreNoeud,
} from "./repair-scope.ts";
export {
  BudgetEpuiseError,
  DEPENSE_INITIALE,
  ajouter,
  assertNonDepasse,
  assertPeutAppeler,
  coutMaxAppel,
  coutUSD,
  issueGeneration,
  peutAppeler,
  type EtatDepense,
  type IssueGeneration,
  type TarifsUSD,
} from "./budget-usd.ts";
export {
  CLE_CORPS_TRONQUE,
  CLE_EMISSION,
  CLE_REPARATION,
  PHASES_ARTEFACT,
  TravailInterrompuError,
  attacherPartiel,
  avecPreservation,
  estExploitable,
  nomArtefact,
  partielDeLErreur,
  provenanceDuNom,
  reparationPartielleVierge,
  type PhaseArtefact,
  type ProvenanceArtefact,
  type ReparationPartielle,
} from "./preservation.ts";
