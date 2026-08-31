// REPAIR LOOP — CONTRATS (Phase 9, ARCHITECTURE §10).
//
// Chaîne imposée par l'architecture, dans cet ordre EXACT :
//   FAIL → DIAGNOSE → CLASSIFY → PLAN → IMPACT ANALYSIS → SIMULATE
//        → POLICY GATE → APPLY → VERIFY → COMMIT   (sinon ROLLBACK)
//
// Deux principes non négociables gouvernent ces contrats :
//  - « jamais erreur → LLM → modification arbitraire » (non-négociable #8) :
//    l'auteur est un PORT, il ne peut RIEN appliquer lui-même ; il propose,
//    et sa proposition traverse un gate déterministe avant d'exister ;
//  - « le juge n'est jamais l'auteur » (non-négociable #5) : les deux ports
//    portent une identité, et la boucle REFUSE de démarrer si elles sont
//    égales — la séparation n'est pas une convention d'usage, c'est un
//    invariant vérifié.
import type { ProposedEdit } from "@deribfy/slots";

export const REPAIR_STAGES = [
  "diagnose",
  "classify",
  "plan",
  "impact",
  "simulate",
  "policy_gate",
  "apply",
  "verify",
  "commit",
] as const;

export type RepairStage = (typeof REPAIR_STAGES)[number];

/** Classes de panne RÉPARABLES — allowlist positive : hors liste = escalade. */
export const REPAIR_CLASSES = [
  "AIR_ACTION_DANGLING",
  "SLOT_IMPLEMENTATION_MISSING",
  "SLOT_POLICY_VIOLATION",
] as const;

export type RepairClass = (typeof REPAIR_CLASSES)[number];

export interface FailureCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

/** Signal d'entrée de la boucle : ce que l'Oracle (ou l'E2E) a constaté. */
export interface FailureSignal {
  readonly source: "oracle" | "e2e" | "sandbox";
  readonly checks: readonly FailureCheck[];
}

/** Élément d'AIR visé, avec la PREUVE qui l'a désigné. */
export interface DiagnosisTarget {
  readonly screenId?: string;
  readonly blockId?: string;
  readonly actionId?: string;
  readonly slotId?: string;
  /** Correction candidate DÉDUITE de l'AIR (jamais devinée). */
  readonly candidate?: string;
}

export interface Diagnosis {
  readonly repairClass: RepairClass | "UNKNOWN";
  /** Faits RE-DÉRIVÉS de l'AIR, pas recopiés du message d'échec. */
  readonly evidence: readonly string[];
  readonly targets: readonly DiagnosisTarget[];
}

export interface SlotSource {
  readonly slotId: string;
  readonly source: string;
  readonly authorId: string;
}

/** État réparable : l'AIR et les slots — JAMAIS les blocs ni la structure. */
export interface RepairState {
  readonly air: unknown;
  readonly slots: readonly SlotSource[];
}

/** Proposition d'un auteur. Elle n'est PAS appliquée : elle est jugée. */
export interface RepairProposal {
  readonly authorId: string;
  /** État complet proposé (l'auteur ne patche jamais en place). */
  readonly next: RepairState;
  /** Éditions de fichiers induites — soumises à la politique de périmètre. */
  readonly edits: readonly ProposedEdit[];
  /** Coût réel de la proposition (Budget Governor). */
  readonly tokens: number;
  readonly rationale: string;
}

export interface RepairAuthorContext {
  readonly diagnosis: Diagnosis;
  readonly state: RepairState;
  readonly attempt: number;
  /** Motifs de refus des tentatives précédentes — l'auteur apprend du gate. */
  readonly previousRefusals: readonly string[];
}

/** PORT auteur (LLM en périphérie, ou déterministe). Il ne juge jamais. */
export interface RepairAuthor {
  readonly id: string;
  propose(context: RepairAuthorContext): RepairProposal | null;
}

export type ApxxState = "conforme" | "non_conforme" | "non_determinee";
export interface ApxxSnapshot {
  readonly dimension: string;
  readonly state: ApxxState;
}

export interface VerificationReport {
  readonly passed: boolean;
  readonly checks: readonly FailureCheck[];
  /** Grille A++ rejouée sur l'artefact vérifié (amendement D-039). */
  readonly apxx: readonly ApxxSnapshot[];
}

/** PORT juge (Oracle déterministe). Il ne propose jamais. */
export interface RepairVerifier {
  readonly id: string;
  verify(state: RepairState): VerificationReport;
}

/** PORT de simulation : compile SANS écrire (dry-run), pour l'impact. */
export interface RepairSimulator {
  simulate(state: RepairState): SimulationResult;
}

export interface SimulationResult {
  readonly ok: boolean;
  readonly rootHash: string;
  readonly paths: readonly string[];
  readonly error?: string;
}

/** Analyse d'impact DÉTERMINISTE, calculée sur deux simulations. */
export interface ImpactAnalysis {
  readonly rootHashBefore: string;
  readonly rootHashAfter: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
}

export interface RepairEvent {
  readonly stage: RepairStage;
  readonly attempt: number;
  readonly ok: boolean;
  readonly detail: string;
}

export type RepairStatus =
  | "repaired"
  | "budget_exhausted"
  | "not_repairable"
  | "refused_by_gate";

export interface RepairOutcome {
  readonly status: RepairStatus;
  readonly attempts: number;
  readonly tokensSpent: number;
  /** Journal COMPLET, étage par étage — la trace auditable de la boucle. */
  readonly journal: readonly RepairEvent[];
  /** État réparé, présent UNIQUEMENT si status === "repaired". */
  readonly state?: RepairState;
  readonly impact?: ImpactAnalysis;
}

export class RepairContractError extends Error {
  readonly code: string;

  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "RepairContractError";
    this.code = code;
  }
}
