export {
  capabilityDefinitionSchema,
  nativeImpactSchema,
  runtimeProfileSchema,
} from "./schema";
export type { CapabilityDefinition, NativeImpact, RuntimeProfile } from "./schema";

export { CAPABILITIES, CAPABILITY_REGISTRY_VERSION } from "./definitions";

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
} from "./registry";
export type {
  ResolvedPermission,
  NativeFootprint,
  CommerceClass,
  CapabilityDiagnostic,
  AirCapabilitySlice,
} from "./registry";
