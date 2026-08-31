// ABSTRACTION PROVIDER v1 (Phase 10 — ARCHITECTURE §15, non-négociable #12).
//
// PROBLÈME MESURÉ SUR LE CORPUS GELÉ (2026-08-29) : les 12 documents
// déclarent **40 valeurs distinctes** de `providerClass` pour une douzaine
// de classes sémantiques réelles — `push_gateway`, `push_messaging`,
// `push_provider`, `push_service` et `managed_push` désignent la MÊME
// chose. Le champ est une chaîne libre émise par le LLM : s'en servir comme
// clé de résolution reviendrait à laisser le modèle définir la topologie
// des fournisseurs, exactement ce que le non-négociable #3 interdit
// (« le LLM demande, le registre décide »).
//
// SOLUTION : la classe canonique n'est jamais lue dans la chaîne libre, elle
// est DÉRIVÉE d'une donnée contrôlée par un registre gelé — la `capability`
// que l'intégration déclare (71 des 79 intégrations du corpus). Les 8
// restantes ne déclarent aucune capability et désignent toutes le backend
// REST de l'app (`rest_api` / `rest_backend`) : une classe canonique unique
// `backend_rest` les couvre, ce que la Phase 5 rend factuel (D-032 : chaque
// app a son projet Supabase).
//
// RÈGLE §15 RESPECTÉE À LA LETTRE : « on ne code jamais deux providers pour
// le principe ». Chaque classe porte donc UN provider réel — celui que le
// registre de capabilities gelé désigne déjà — et UN substitut explicitement
// nommé `mock`, qui sert à PROUVER le remplacement sans prétendre qu'un
// second fournisseur commercial est intégré.
import { CAPABILITIES } from "@deribfy/capability-registry";

export const PROVIDER_MOCK = "mock";

/** Classe canonique du backend REST de l'app (intégrations sans capability). */
export const BACKEND_REST_CLASS = "backend_rest";

export interface ProviderDefinition {
  readonly id: string;
  readonly kind: "real" | "mock";
  /** Paquet d'implémentation ; vide pour le substitut. */
  readonly implementation: string;
}

export interface ProviderClassDefinition {
  readonly providerClass: string;
  /** Capability du registre GELÉ dont cette classe est le créneau provider. */
  readonly capability?: string;
  readonly providers: readonly ProviderDefinition[];
  readonly defaultProvider: string;
}

export class ProviderRegistryError extends Error {
  readonly code: string;

  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ProviderRegistryError";
    this.code = code;
  }
}

/**
 * Classe canonique d'une capability. Le schéma du lock impose
 * `^[a-z][a-z0-9_]*$` : `payments.psp` devient donc `payments_psp`. La
 * transformation est totale et réversible, jamais une renomination
 * arbitraire.
 */
export const classOfCapability = (capability: string): string => capability.replace(/\./g, "_");

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// Le registre est DÉRIVÉ du registre de capabilities gelé : impossible qu'il
// en diverge, puisqu'il n'en recopie aucune valeur à la main.
const CAPABILITY_CLASSES: readonly ProviderClassDefinition[] = CAPABILITIES.map((capability) => ({
  providerClass: classOfCapability(capability.id),
  capability: capability.id,
  providers: [
    { id: capability.implementation.package, kind: "real" as const, implementation: capability.implementation.package },
    { id: PROVIDER_MOCK, kind: "mock" as const, implementation: "" },
  ],
  defaultProvider: capability.implementation.package,
})).sort((a, b) => byCodeUnit(a.providerClass, b.providerClass));

// Backend REST de l'app : le provider réel est le projet Supabase provisionné
// par app (D-032, Phase 5 — provisioning, RLS et teardown prouvés sur un
// projet réel). Ce n'est pas une déclaration d'intention : l'implémentation
// existe et a tourné.
const BACKEND_CLASS: ProviderClassDefinition = {
  providerClass: BACKEND_REST_CLASS,
  providers: [
    { id: "supabase", kind: "real", implementation: "@supabase/supabase-js" },
    { id: PROVIDER_MOCK, kind: "mock", implementation: "" },
  ],
  defaultProvider: "supabase",
};

export const PROVIDER_CLASSES: readonly ProviderClassDefinition[] = [
  ...CAPABILITY_CLASSES,
  BACKEND_CLASS,
].sort((a, b) => byCodeUnit(a.providerClass, b.providerClass));

const byClass = new Map(PROVIDER_CLASSES.map((c) => [c.providerClass, c]));

export const getProviderClass = (providerClass: string): ProviderClassDefinition | undefined =>
  byClass.get(providerClass);

export const listProviderClasses = (): readonly string[] => PROVIDER_CLASSES.map((c) => c.providerClass);

/** Tranche d'AIR nécessaire ici (patron des ponts `validateAirCapabilities`). */
export interface AirProviderSlice {
  readonly integrations: readonly {
    readonly id: string;
    readonly providerClass: string;
    readonly capability?: string;
  }[];
}

export interface ResolvedProvider {
  readonly providerClass: string;
  readonly provider: string;
}

/**
 * Classes canoniques RÉELLEMENT requises par un document, dérivées des
 * intégrations. Déterministe : tri par point de code, doublons fusionnés
 * (deux intégrations d'une même capability partagent un créneau provider).
 */
export function requiredProviderClasses(air: AirProviderSlice): readonly string[] {
  const classes = new Set<string>();
  for (const integration of air.integrations) {
    const canonical =
      integration.capability === undefined
        ? BACKEND_REST_CLASS
        : classOfCapability(integration.capability);
    if (!byClass.has(canonical)) {
      throw new ProviderRegistryError(
        "PROVIDER_CLASS_UNKNOWN",
        `intégration "${integration.id}" : classe canonique "${canonical}" hors registre`,
      );
    }
    classes.add(canonical);
  }
  return [...classes].sort(byCodeUnit);
}

/**
 * Sélection des providers pour le lock. FAIL-CLOSED sur les substitutions :
 * une classe non requise par le document, ou un provider inconnu de cette
 * classe, est un refus net — jamais une sélection silencieuse par défaut.
 */
export function selectProviders(
  air: AirProviderSlice,
  overrides: Readonly<Record<string, string>> = {},
): readonly ResolvedProvider[] {
  const required = requiredProviderClasses(air);
  for (const [providerClass, provider] of Object.entries(overrides)) {
    if (!required.includes(providerClass)) {
      throw new ProviderRegistryError(
        "PROVIDER_OVERRIDE_UNUSED",
        `substitution "${providerClass}" → "${provider}" : cette classe n'est pas requise par le document`,
      );
    }
    const definition = byClass.get(providerClass);
    if (definition?.providers.every((p) => p.id !== provider) === true) {
      throw new ProviderRegistryError(
        "PROVIDER_UNKNOWN",
        `substitution "${providerClass}" → "${provider}" : provider hors registre`,
      );
    }
  }
  return required.map((providerClass) => ({
    providerClass,
    provider: overrides[providerClass] ?? byClass.get(providerClass)?.defaultProvider ?? PROVIDER_MOCK,
  }));
}
