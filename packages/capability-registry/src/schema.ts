import { z } from "zod";
import { capabilityRefSchema, semverSchema } from "@deribfy/air-schema";

// Entrée du Capability Registry (ARCHITECTURE §2) : une capacité ne s'obtient
// que par inscription ici — allowlist positive, même philosophie que les cinq
// frontières du produit web (canTransact, modeCapabilities, …). Le LLM
// demande une capacité ; il ne choisit JAMAIS un package ni un provider.

// Impact d'empreinte native : autorité du Capability Router (OTA vs rebuild).
export const nativeImpactSchema = z.enum(["none", "light", "heavy"]);

// Profils de runtime versionnés (ARCHITECTURE §12, implémentés Phase 11) :
// core = JS pur, standard = natifs légers courants, extended = natifs lourds.
// La cohérence impact ↔ profils est verrouillée par les cliquets de registre.
export const runtimeProfileSchema = z.enum(["core", "standard", "extended"]);

const implementationSchema = z.strictObject({
  // Le KIND est une donnée d'architecture ; le package/version ne sont que la
  // résolution par défaut — la version EXACTE est figée dans project.lock.
  kind: z.enum(["expo_module", "react_native_module", "js_library", "provider_service"]),
  package: z.string().min(1),
  version: z.string().min(1),
});

const inducedPermissionSchema = z.strictObject({
  platform: z.enum(["ios", "android"]),
  permission: z.string().regex(/^[A-Za-z][A-Za-z0-9_.]*$/),
  // Clé i18n de justification : le Compliance Generator produit les textes
  // par locale — jamais de texte en dur ici.
  purposeKey: z.string().regex(/^permission\.[a-z][a-z0-9_.]*$/),
});

export const capabilityDefinitionSchema = z.strictObject({
  id: capabilityRefSchema,
  version: semverSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  implementation: implementationSchema,
  dependencies: z.strictObject({
    capabilities: z.array(capabilityRefSchema),
    nativeModules: z.array(z.string().min(1)),
  }),
  platforms: z.strictObject({
    ios: z.strictObject({
      supported: z.boolean(),
      minOsVersion: z.string().regex(/^\d+(\.\d+)?$/).optional(),
    }),
    android: z.strictObject({
      supported: z.boolean(),
      minSdk: z.number().int().min(21).optional(),
    }),
  }),
  compatibleRuntimeProfiles: z.array(runtimeProfileSchema).min(1),
  nativeConfig: z.strictObject({
    infoPlistKeys: z.array(z.string().min(1)),
    androidManifestPermissions: z.array(z.string().min(1)),
    entitlements: z.array(z.string().min(1)),
  }),
  inducedPermissions: z.array(inducedPermissionSchema),
  cost: z.strictObject({
    model: z.enum(["free", "usage_based", "subscription"]),
    notes: z.string().min(1),
  }),
  nativeFootprint: z.strictObject({
    impact: nativeImpactSchema,
    nativeModules: z.array(z.string().min(1)),
  }),
  otaCompatible: z.boolean(),
  requiresRebuild: z.boolean(),
  // Contrainte de classe commerce (§2) : digital ⇒ IAP obligatoire ;
  // physical_or_offapp ⇒ PSP autorisé. "none" = capacité hors commerce.
  commerceConstraint: z.enum(["none", "digital", "physical_or_offapp"]),
  constraints: z.array(z.string().min(1)),
  conflicts: z.array(capabilityRefSchema),
  provenance: z.strictObject({
    source: z.enum(["first_party", "expo_sdk", "community_vetted"]),
    reference: z.string().min(1),
  }),
  buildFootprint: z.strictObject({
    estimatedSizeKb: z.number().int().min(0),
    buildTimeImpact: z.enum(["none", "low", "medium", "high"]),
  }),
});

export type CapabilityDefinition = z.infer<typeof capabilityDefinitionSchema>;
export type NativeImpact = z.infer<typeof nativeImpactSchema>;
export type RuntimeProfile = z.infer<typeof runtimeProfileSchema>;
