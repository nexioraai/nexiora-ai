// CLIQUET DU RELEASE TRAIN v1 (D-027) : pins exacts verrouillés + scellés
// des paquets GELÉS recalculés depuis les VRAIES sources. Toute divergence
// (édition d'une zone gelée, dérive de version) = échec — l'évolution
// passe par une décision consignée et l'édition CONSCIENTE de ce test.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AIR_SCHEMA_VERSION } from "@deribfy/air-schema";
import { CAPABILITY_REGISTRY_VERSION } from "@deribfy/capability-registry";
import { DESIGN_TOKENS_VERSION } from "@deribfy/design-tokens";
import { RELEASE_TRAIN_V1 } from "../src/release-train.ts";
import { hashSourceTree } from "./helpers.ts";
// Module PUR du registre de blocs par chemin direct (précédent consigné
// D-025 : l'index du paquet tire les composants react-native).
import { BLOCK_REGISTRY_VERSION } from "../../blocks/src/definitions.ts";

const PACKAGES = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("release train v1 — pins exacts (cliquet)", () => {
  it("identité et toolchain démontrés (3.4 / P-003 / V3)", () => {
    expect(RELEASE_TRAIN_V1.id).toBe("rt-2026.08");
    expect(RELEASE_TRAIN_V1.version).toBe("1.0.0");
    expect(RELEASE_TRAIN_V1.toolchain).toEqual({
      node: "24.16.0",
      expoSdk: "57.0.17",
      reactNative: "0.86.3",
    });
  });

  it("dépendances du gabarit = versions prouvées sur device au banc V4", () => {
    expect(RELEASE_TRAIN_V1.templateDependencies).toEqual({
      expo: "57.0.17",
      // D-029 (édition consciente du cliquet) : config native air.native
      // appliquée au prebuild — bundledNativeModules SDK 57.
      "expo-build-properties": "57.0.15",
      "expo-status-bar": "3.0.9",
      react: "19.2.3",
      "react-native": "0.86.3",
      "@react-navigation/native": "7.3.18",
      "@react-navigation/native-stack": "7.18.10",
      "react-native-screens": "4.26.2",
      "react-native-safe-area-context": "5.7.0",
    });
  });

  it("versions de contrats alignées sur les registres gelés", () => {
    expect(RELEASE_TRAIN_V1.airSchemaVersion).toBe(AIR_SCHEMA_VERSION);
    expect(RELEASE_TRAIN_V1.capabilityRegistryVersion).toBe(
      CAPABILITY_REGISTRY_VERSION,
    );
    expect(RELEASE_TRAIN_V1.designTokensVersion).toBe(DESIGN_TOKENS_VERSION);
    expect(RELEASE_TRAIN_V1.blockRegistryVersion).toBe(BLOCK_REGISTRY_VERSION);
  });

  it("scellés des sources gelées : blocs", () => {
    expect(hashSourceTree(join(PACKAGES, "blocks", "src"))).toBe(
      RELEASE_TRAIN_V1.blocksSourcesHash,
    );
  });

  it("scellés des sources gelées : capabilities", () => {
    expect(hashSourceTree(join(PACKAGES, "capability-registry", "src"))).toBe(
      RELEASE_TRAIN_V1.capabilitySourcesHash,
    );
  });

  it("scellé du gabarit versionné (D-027-R42) — édition = évolution consciente", () => {
    expect(hashSourceTree(join(PACKAGES, "compiler", "template"))).toBe(
      RELEASE_TRAIN_V1.templateHash,
    );
  });

  it("scellés des sources gelées : design tokens (src + tokens.json)", () => {
    expect(
      hashSourceTree(join(PACKAGES, "design-tokens", "src"), [
        ["tokens.json", join(PACKAGES, "design-tokens", "tokens.json")],
      ]),
    ).toBe(RELEASE_TRAIN_V1.designTokensSourcesHash);
  });
});
