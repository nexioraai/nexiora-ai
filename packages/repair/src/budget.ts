// BUDGET GOVERNOR (Phase 9 — ARCHITECTURE §10 : « borné : nombre
// d'itérations max + budget ; au-delà : échec propre, remonté à l'humain »).
//
// Deux bornes INDÉPENDANTES, parce qu'elles protègent de deux dérives
// différentes : le nombre d'itérations borne l'acharnement, le budget de
// jetons borne la dépense. Franchir l'une ou l'autre arrête la boucle — et
// l'arrêt est un ÉCHEC PROPRE, jamais une exception non gérée ni une
// réparation « au mieux » livrée quand même.
import { RepairContractError } from "./contracts.ts";

export interface RepairBudget {
  readonly maxAttempts: number;
  readonly maxTokens: number;
}

export interface BudgetLedger {
  readonly attempts: number;
  readonly tokens: number;
}

export const EMPTY_LEDGER: BudgetLedger = { attempts: 0, tokens: 0 };

export function assertBudget(budget: RepairBudget): void {
  if (!Number.isInteger(budget.maxAttempts) || budget.maxAttempts < 1) {
    throw new RepairContractError("REPAIR_BUDGET_INVALID", "maxAttempts doit être un entier ≥ 1");
  }
  if (!Number.isInteger(budget.maxTokens) || budget.maxTokens < 1) {
    throw new RepairContractError("REPAIR_BUDGET_INVALID", "maxTokens doit être un entier ≥ 1");
  }
}

/** Une tentative supplémentaire est-elle autorisée AVANT de la lancer ? */
export function canAttempt(budget: RepairBudget, ledger: BudgetLedger): boolean {
  return ledger.attempts < budget.maxAttempts && ledger.tokens < budget.maxTokens;
}

/**
 * Enregistre la dépense d'une tentative. Le dépassement est CONSTATÉ, jamais
 * masqué : le ledger porte la dépense réelle même si elle franchit la borne,
 * pour que le rapport final dise la vérité sur ce qui a été consommé.
 */
export function spend(ledger: BudgetLedger, tokens: number): BudgetLedger {
  if (!Number.isFinite(tokens) || tokens < 0) {
    throw new RepairContractError("REPAIR_SPEND_INVALID", `dépense invalide : ${String(tokens)}`);
  }
  return { attempts: ledger.attempts + 1, tokens: ledger.tokens + tokens };
}

/** Le budget est-il épuisé APRÈS coup (borne franchie) ? */
export function isExhausted(budget: RepairBudget, ledger: BudgetLedger): boolean {
  return ledger.attempts >= budget.maxAttempts || ledger.tokens >= budget.maxTokens;
}
