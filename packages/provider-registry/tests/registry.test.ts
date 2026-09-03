// ABSTRACTION PROVIDER — preuves (Phase 10, §15).
//
// Trois propriétés sont éprouvées ici :
//  1. le registre ne peut pas DIVERGER du registre de capabilities gelé —
//     il en est dérivé, et un cliquet le vérifie explicitement ;
//  2. la classe canonique ne dépend JAMAIS de la chaîne libre de l'AIR —
//     preuve par contre-épreuve sur les 40 valeurs réellement mesurées ;
//  3. la substitution est fail-closed.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "@deribfy/capability-registry";
import {
  BACKEND_REST_CLASS,
  PROVIDER_CLASSES,
  PROVIDER_MOCK,
  ProviderRegistryError,
  classOfCapability,
  requiredProviderClasses,
  selectProviders,
} from "../src/registry.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus", "corpus-v2");
const docs = readdirSync(CORPUS)
  .filter((f) => f.endsWith(".air.json"))
  .sort();
interface Air {
  integrations: { id: string; providerClass: string; capability?: string }[];
}
const load = (f: string): Air => JSON.parse(readFileSync(join(CORPUS, f), "utf8")) as Air;

describe("cohérence avec le registre de capabilities GELÉ", () => {
  it("une classe canonique par capability gelée, plus le backend REST", () => {
    expect(PROVIDER_CLASSES).toHaveLength(CAPABILITIES.length + 1);
    for (const capability of CAPABILITIES) {
      const found = PROVIDER_CLASSES.find((c) => c.capability === capability.id);
      expect(found?.providerClass, capability.id).toBe(classOfCapability(capability.id));
    }
  });

  it("CLIQUET : le provider réel est EXACTEMENT l'implémentation du registre gelé", () => {
    for (const definition of PROVIDER_CLASSES) {
      if (definition.capability === undefined) continue;
      const capability = CAPABILITIES.find((c) => c.id === definition.capability);
      expect(definition.defaultProvider, definition.providerClass).toBe(capability?.implementation.package);
      const real = definition.providers.filter((p) => p.kind === "real");
      // §15 : « on ne code jamais deux providers pour le principe ».
      expect(real, definition.providerClass).toHaveLength(1);
    }
  });

  it("chaque classe offre le substitut explicite `mock`", () => {
    for (const definition of PROVIDER_CLASSES) {
      expect(definition.providers.some((p) => p.id === PROVIDER_MOCK && p.kind === "mock")).toBe(true);
    }
  });

  it("les identifiants de classe respectent le schéma du lock", () => {
    for (const definition of PROVIDER_CLASSES) {
      expect(definition.providerClass).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe("la classe canonique ne vient JAMAIS de la chaîne libre de l'AIR", () => {
  it("les 40 `providerClass` du corpus se réduisent à un petit jeu canonique", () => {
    const libres = new Set<string>();
    const canoniques = new Set<string>();
    for (const file of docs) {
      const air = load(file);
      for (const integration of air.integrations) libres.add(integration.providerClass);
      for (const canonical of requiredProviderClasses(air)) canoniques.add(canonical);
    }
    // Le fait mesuré qui justifie tout ce module (voir en-tête de registry.ts).
    expect(libres.size).toBe(40);
    expect([...canoniques].sort()).toEqual([
      "analytics",
      "auth",
      "backend_rest",
      "barcode_scan",
      "calendar",
      "camera",
      "deep_links",
      "geolocation",
      "maps",
      "media_upload",
      "offline_storage",
      "payments_iap",
      "payments_psp",
      "push_notifications",
      "share",
    ]);
  });

  it("CONTRE-ÉPREUVE : renommer la chaîne libre ne change RIEN au résultat", () => {
    const air = load("resto-quartier.air.json");
    const avant = requiredProviderClasses(air);
    const renomme: Air = {
      integrations: air.integrations.map((i, index) => ({ ...i, providerClass: `classe_inventee_${String(index)}` })),
    };
    expect(requiredProviderClasses(renomme)).toEqual(avant);
  });

  it("les 12 documents du corpus se résolvent sans exception", () => {
    for (const file of docs) {
      expect(() => selectProviders(load(file)), file).not.toThrow();
    }
  });

  it("une intégration sans capability tombe sur le backend REST de l'app", () => {
    const air: Air = { integrations: [{ id: "intg_api", providerClass: "rest_api" }] };
    expect(requiredProviderClasses(air)).toEqual([BACKEND_REST_CLASS]);
  });
});

describe("sélection et substitution", () => {
  const air = load("resto-quartier.air.json");

  it("par défaut : le provider réel du registre gelé", () => {
    const selected = selectProviders(air);
    expect(selected.find((p) => p.providerClass === "payments_psp")?.provider).toBe(
      "@stripe/stripe-react-native",
    );
    expect(selected.find((p) => p.providerClass === "auth")?.provider).toBe("@supabase/supabase-js");
    expect(selected.find((p) => p.providerClass === BACKEND_REST_CLASS)).toBeUndefined();
  });

  it("substitution : seule la classe visée change", () => {
    const base = selectProviders(air);
    const substitue = selectProviders(air, { payments_psp: PROVIDER_MOCK });
    expect(substitue.find((p) => p.providerClass === "payments_psp")?.provider).toBe(PROVIDER_MOCK);
    for (const entry of base) {
      if (entry.providerClass === "payments_psp") continue;
      expect(substitue.find((p) => p.providerClass === entry.providerClass)?.provider).toBe(entry.provider);
    }
  });

  it("FAIL-CLOSED : classe non requise par le document", () => {
    expect(() => selectProviders(air, { maps: PROVIDER_MOCK })).toThrow(ProviderRegistryError);
  });

  it("FAIL-CLOSED : provider inconnu de la classe", () => {
    expect(() => selectProviders(air, { payments_psp: "adyen" })).toThrow(ProviderRegistryError);
  });

  it("déterminisme : même entrée ⇒ même sortie, triée", () => {
    const a = selectProviders(air);
    const b = selectProviders({ integrations: [...air.integrations].reverse() });
    expect(b).toEqual(a);
    expect(a.map((p) => p.providerClass)).toEqual([...a.map((p) => p.providerClass)].sort());
  });
});
