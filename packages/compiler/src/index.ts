// @deribfy/compiler — Compilateur déterministe v1 (Phase 4, D-026).
// 4.1 : release train v1 + résolveur AIR→lock. Étages d'émission : 4.2+.
export { RELEASE_TRAIN_V1 } from "./release-train.ts";
export type { ReleaseTrain } from "./release-train.ts";
export { LockResolutionError, normalizeAir, resolveLock } from "./resolve-lock.ts";
export type { LockDiagnostic } from "./resolve-lock.ts";
export { EmitError, emitProject } from "./emit-project.ts";
export {
  emitAppJson,
  emitPermissionsManifest,
  previewIdentity,
} from "./emit-manifests.ts";
export type { EmitOptions, EmittedProject, SlotSource } from "./emit-project.ts";
export { compileProject } from "./compile-project.ts";
export type { CompiledProject } from "./compile-project.ts";
export {
  ArtifactStoreError,
  LocalArtifactStore,
  storeCompiledProject,
} from "./artifact-store.ts";
export type { ArtifactStore, StoredProject } from "./artifact-store.ts";
export { EMBEDDED_TEMPLATE } from "./embedded-template.generated.ts";
export { buildDemoFixtures } from "./demo-fixtures.ts";
export {
  DERIVED_KEYS,
  applyThemeOverrides,
  emitThemeModule,
  hasThemeOverrides,
  isOverridableKey,
} from "./emit-theme.ts";
export type { ThemeOverrideProblem } from "./emit-theme.ts";
export type { DemoInstance } from "./demo-fixtures.ts";
export { EMBEDDED_SOURCES, buildEmbeddedAssets, rewriteEmbeddedSource } from "./embed-lib.ts";
export {
  EMBEDDED_ASSETS,
  EMBEDDED_ASSETS_FINGERPRINT,
} from "./embedded-assets.generated.ts";
