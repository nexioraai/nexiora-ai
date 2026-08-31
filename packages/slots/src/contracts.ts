// CONTRATS DES CODE SLOTS v1 (Phase 9 — ARCHITECTURE §4).
//
// Un slot est du code écrit par un LLM sous influence potentielle du prompt
// utilisateur (injection indirecte, §27) : sa SIGNATURE et ses IMPORTS sont
// déclarés dans l'AIR (source de vérité), son CODE vit hors de l'AIR comme
// artefact adressé par hash, et il ne franchit jamais la politique AST sans
// avoir été analysé (`policy.ts`).
//
// PERMISSIONS (§4) : en v1 le jeu de permissions d'un slot est VIDE PAR
// CONSTRUCTION — la politique lui interdit tout accès réseau, disque,
// secret et toute exécution dynamique. Il n'y a donc rien à accorder, et
// aucune permission ne peut être obtenue par omission. Le jour où un slot
// devra consommer une capability, ce sera une décision consignée, pas un
// élargissement silencieux de cette surface.
//
// Invariant de conception v1, lu DIRECTEMENT du corpus gelé : tout slot est
// une fonction PURE de ses entrées déclarées — `slot_generer_reference_commande`
// reçoit `horodatage`, `slot_estimer_heure_retrait` reçoit `maintenant`. Les
// sources ambiantes de non-déterminisme sont donc refusées par la politique,
// jamais tolérées « au cas où ».

/** Implémentation d'un slot : le code, et l'auteur qui en répond. */
export interface SlotImplementation {
  readonly slotId: string;
  /** Source TypeScript complète du module de slot (LF, UTF-8). */
  readonly source: string;
  /** Identité de l'auteur (modèle LLM ou humain) — sert au garde juge ≠ auteur. */
  readonly authorId: string;
}

/** Jeu d'implémentations soumis au compilateur pour un projet donné. */
export type SlotBundle = readonly SlotImplementation[];

/** Déclaration de slot telle qu'elle vit dans l'AIR (tranche minimale lue ici). */
export interface SlotDeclaration {
  readonly id: string;
  readonly inputs: readonly { readonly name: string; readonly type: string }[];
  readonly outputs: readonly { readonly name: string; readonly type: string }[];
  readonly allowedImports: readonly string[];
}

export interface SlotViolation {
  /** Code stable — jamais un texte libre (les verdicts sont machinables). */
  readonly code: string;
  readonly slotId: string;
  /** Ligne 1-indexée dans la source du slot, 0 si non localisable. */
  readonly line: number;
  readonly detail: string;
}

export interface SlotPolicyVerdict {
  readonly passed: boolean;
  readonly violations: readonly SlotViolation[];
}

/** Nom EXIGÉ de la fonction exportée par un module de slot. */
export const SLOT_ENTRY_NAME = "runSlot";

export class SlotPolicyError extends Error {
  readonly code: string;

  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "SlotPolicyError";
    this.code = code;
  }
}
