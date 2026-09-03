// @deribfy/slots — Code Slots v1 (Phase 9). Contrats + politique AST +
// politique de périmètre des patchs. AUCUN accès fs/réseau : fonctions
// pures, analysables et rejouables par l'Oracle comme par le Repair Loop.
export { SLOT_ENTRY_NAME, SlotPolicyError } from "./contracts.ts";
export type {
  SlotBundle,
  SlotDeclaration,
  SlotImplementation,
  SlotPolicyVerdict,
  SlotViolation,
} from "./contracts.ts";
export { checkSlotBundle, checkSlotImplementation } from "./policy.ts";
export { PATCH_ALLOWED_PREFIX, checkPatchScope } from "./patch-policy.ts";
export type { PatchVerdict, PatchViolation, ProposedEdit } from "./patch-policy.ts";
