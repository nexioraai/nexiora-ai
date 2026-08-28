// @deribfy/compiler — Compilateur déterministe v1 (Phase 4, D-026).
// 4.1 : release train v1 + résolveur AIR→lock. Étages d'émission : 4.2+.
export { RELEASE_TRAIN_V1 } from "./release-train.ts";
export type { ReleaseTrain } from "./release-train.ts";
export { LockResolutionError, resolveLock } from "./resolve-lock.ts";
export type { LockDiagnostic } from "./resolve-lock.ts";
