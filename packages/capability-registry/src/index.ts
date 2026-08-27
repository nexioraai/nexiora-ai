export {
  capabilityDefinitionSchema,
  nativeImpactSchema,
  runtimeProfileSchema,
} from "./schema.ts";
export type { CapabilityDefinition, NativeImpact, RuntimeProfile } from "./schema.ts";

export { CAPABILITIES, CAPABILITY_REGISTRY_VERSION } from "./definitions.ts";

export {
  UnknownCapabilityError,
  listCapabilities,
  getCapability,
  requireCapability,
  resolveWithDependencies,
  inducedPermissionsFor,
  nativeFootprintOf,
  findConflicts,
  validateAirCapabilities,
} from "./registry.ts";
export type {
  ResolvedPermission,
  NativeFootprint,
  CommerceClass,
  CapabilityDiagnostic,
  AirCapabilitySlice,
} from "./registry.ts";
