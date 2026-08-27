export {
  AIR_SCHEMA_VERSION,
  projectAirSchema,
  fieldTypeSchema,
  localeSchema,
  localizedTextSchema,
  flatConfigSchema,
  semverSchema,
  sha256Schema,
} from "./air";
export type { ProjectAir, AirScreen, AirEntity, AirAction } from "./air";

export { LOCK_SCHEMA_VERSION, projectLockSchema } from "./lock";
export type { ProjectLock } from "./lock";

export {
  DEPLOYMENT_STATE_SCHEMA_VERSION,
  deploymentStateSchema,
} from "./deployment-state";
export type { DeploymentState } from "./deployment-state";

export { canonicalJson, sha256Hex, hashCanonical } from "./canonical";

export { validateAir, assertValidAir, AirSemanticError } from "./validate";
export type { AirDiagnostic } from "./validate";

export { AIR_MIGRATIONS, AirMigrationError, migrateAirDocument } from "./migrations";
export type { AirMigration } from "./migrations";

export {
  projectAirJsonSchema,
  projectLockJsonSchema,
  deploymentStateJsonSchema,
} from "./json-schema";

export * from "./ids";
