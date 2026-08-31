// @deribfy/provider-registry — abstraction provider v1 (Phase 10, §15).
export {
  BACKEND_REST_CLASS,
  PROVIDER_CLASSES,
  PROVIDER_MOCK,
  ProviderRegistryError,
  classOfCapability,
  getProviderClass,
  listProviderClasses,
  requiredProviderClasses,
  selectProviders,
} from "./registry.ts";
export type {
  AirProviderSlice,
  ProviderClassDefinition,
  ProviderDefinition,
  ResolvedProvider,
} from "./registry.ts";
