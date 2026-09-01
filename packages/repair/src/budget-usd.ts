// GOUVERNEUR DE DÉPENSE EN DOLLARS (D-103) — borne la dépense RÉELLE d'une
// campagne d'émission, appel par appel.
//
// ────────────────────────────────────────────────────────────────────────
// CAUSE RACINE MESURÉE
//
// Le harnais d'émission portait un plafond de 25 $, vérifié UNE SEULE FOIS,
// au début de chaque intention, et le coût n'était additionné qu'APRÈS
// l'intention entière. Lancer une intention unique revenait donc à comparer
// le plafond à zéro, puis à laisser la génération courir sans aucun contrôle.
//
// Conséquence : la génération P6 a coûté 2,7396 $ pour un budget annoncé de
// 2,50 $, sans qu'aucun mécanisme ne puisse l'interrompre. Et l'exposition
// réelle d'un lancement n'était pas 2,50 $ mais ~16,80 $ — 28 appels au pire,
// 16 000 jetons de sortie chacun.
//
// Ce gouverneur borne la dépense AVANT chaque appel, et la recompte APRÈS.
// Il ne tronque jamais une génération légitime : il refuse d'ENGAGER un appel
// dont le coût maximal ferait franchir le plafond. Un travail commencé va
// jusqu'au bout de l'appel en cours ; c'est le suivant qui est refusé.
// ────────────────────────────────────────────────────────────────────────

/** Tarifs $/million de jetons. */
export interface TarifsUSD {
  readonly entree: number;
  readonly ecritureCache: number;
  readonly lectureCache: number;
  readonly sortie: number;
}

export interface EtatDepense {
  readonly depense: number;
  readonly appels: number;
}

export const DEPENSE_INITIALE: EtatDepense = { depense: 0, appels: 0 };

/** Arrêt budgétaire : un ÉCHEC PROPRE, jamais un succès déguisé. */
export class BudgetEpuiseError extends Error {
  readonly depense: number;
  readonly plafond: number;
  readonly appels: number;
  constructor(message: string, depense: number, plafond: number, appels: number) {
    super(message);
    this.name = "BudgetEpuiseError";
    this.depense = depense;
    this.plafond = plafond;
    this.appels = appels;
  }
}

export function coutUSD(usage: Readonly<Record<string, number | undefined>>, prix: TarifsUSD): number {
  return (
    ((usage.input_tokens ?? 0) * prix.entree +
      (usage.cache_creation_input_tokens ?? 0) * prix.ecritureCache +
      (usage.cache_read_input_tokens ?? 0) * prix.lectureCache +
      (usage.output_tokens ?? 0) * prix.sortie) /
    1e6
  );
}

/**
 * Coût MAXIMAL qu'un appel peut atteindre : la sortie est bornée par
 * `maxTokens`, l'entrée est estimée depuis la longueur du prompt. Volontairement
 * PESSIMISTE — un garde qui sous-estime ne garde rien.
 */
export function coutMaxAppel(promptChars: number, maxTokens: number, prix: TarifsUSD): number {
  const jetonsEntree = Math.ceil(promptChars / 3); // borne haute : ~3 car./jeton
  return (jetonsEntree * prix.entree + maxTokens * prix.sortie) / 1e6;
}

/** Le prochain appel tient-il dans le plafond, au pire cas ? */
export function peutAppeler(plafond: number, etat: EtatDepense, coutMax: number): boolean {
  return etat.depense + coutMax <= plafond;
}

/** Refuse d'ENGAGER un appel qui pourrait franchir le plafond. */
export function assertPeutAppeler(
  plafond: number,
  etat: EtatDepense,
  coutMax: number,
  quoi: string,
): void {
  if (peutAppeler(plafond, etat, coutMax)) return;
  throw new BudgetEpuiseError(
    `budget ${plafond.toFixed(2)} $ : ${quoi} refusé AVANT appel — ` +
      `dépensé ${etat.depense.toFixed(4)} $, coût maximal de cet appel ${coutMax.toFixed(4)} $`,
    etat.depense,
    plafond,
    etat.appels,
  );
}

export function ajouter(etat: EtatDepense, cout: number): EtatDepense {
  return { depense: etat.depense + cout, appels: etat.appels + 1 };
}

/** Le plafond est-il franchi APRÈS un appel réellement facturé ? */
export function assertNonDepasse(plafond: number, etat: EtatDepense, quoi: string): void {
  if (etat.depense <= plafond) return;
  throw new BudgetEpuiseError(
    `budget ${plafond.toFixed(2)} $ FRANCHI après ${quoi} — dépensé ${etat.depense.toFixed(4)} $`,
    etat.depense,
    plafond,
    etat.appels,
  );
}

/** QUATRE issues DISTINCTES, jamais confondues. */
export type IssueGeneration = "terminee" | "rejetee" | "interrompue-budget" | "echec-technique";

/**
 * `valid` ne peut JAMAIS être vrai si la génération a été interrompue : un
 * arrêt budgétaire laisse un document partiel, il ne certifie rien.
 *
 * ── `echec-technique` — AJOUTÉ APRÈS P9 (2026-09-01).
 *
 * CAUSE RACINE MESURÉE : ce classifieur ne connaissait que TROIS états. Une
 * erreur technique — le `529 Overloaded` reçu par P9 pendant la réparation —
 * ne correspondait à aucun, et retombait donc sur le dernier `return` :
 * `terminee`, l'état le PLUS FAVORABLE. Le journal d'une génération qui avait
 * échoué pouvait affirmer qu'elle s'était terminée.
 *
 * `valid` valait déjà `false` dans ce cas ; ce n'est pas une consolation. Une
 * issue est lue par un humain qui cherche ce qui s'est passé, et « terminée »
 * lui répondait faux. C'est le faux positif que ce chantier ferme partout
 * ailleurs, laissé ouvert dans l'instrument qui rend compte des autres.
 *
 * ORDRE DE PRÉCÉDENCE, énoncé : un arrêt budgétaire est un échec PROPRE et
 * délibéré — il prime, car c'est notre garde qui a mordu. Vient ensuite
 * l'erreur technique : c'est elle qui a arrêté la course. Le rejet de
 * réparation ne la qualifie pas — il porte sur un document que la panne a
 * empêché d'achever.
 */
export function issueGeneration(params: {
  readonly interrompuBudget: boolean;
  readonly erreurTechnique: boolean;
  readonly reparationRejetee: boolean;
  readonly sansDiagnostic: boolean;
}): { readonly issue: IssueGeneration; readonly valid: boolean } {
  if (params.interrompuBudget) return { issue: "interrompue-budget", valid: false };
  if (params.erreurTechnique) return { issue: "echec-technique", valid: false };
  if (params.reparationRejetee) return { issue: "rejetee", valid: false };
  return { issue: "terminee", valid: params.sansDiagnostic };
}
