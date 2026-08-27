export {
  AIR_SCHEMA_VERSION,
  projectAirSchema,
  fieldTypeSchema,
  localeSchema,
  localizedTextSchema,
  flatConfigSchema,
  semverSchema,
  sha256Schema,
} from "./air.ts";
export type { ProjectAir, AirScreen, AirEntity, AirAction } from "./air.ts";

export { LOCK_SCHEMA_VERSION, projectLockSchema } from "./lock.ts";
export type { ProjectLock } from "./lock.ts";

export {
  DEPLOYMENT_STATE_SCHEMA_VERSION,
  deploymentStateSchema,
} from "./deployment-state.ts";
export type { DeploymentState } from "./deployment-state.ts";

export { canonicalJson, sha256Hex, hashCanonical } from "./canonical.ts";

export { renderAirToText } from "./render-text.ts";

export { validateAir, assertValidAir, AirSemanticError } from "./validate.ts";
export type { AirDiagnostic } from "./validate.ts";

export { AIR_MIGRATIONS, AirMigrationError, migrateAirDocument } from "./migrations.ts";
export type { AirMigration } from "./migrations.ts";

export {
  projectAirJsonSchema,
  projectLockJsonSchema,
  deploymentStateJsonSchema,
} from "./json-schema.ts";

export * from "./ids.ts";
