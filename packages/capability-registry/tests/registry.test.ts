import { describe, expect, it } from "vitest";
import type { AirCapabilitySlice } from "../src";
import {
  UnknownCapabilityError,
  findConflicts,
  inducedPermissionsFor,
  nativeFootprintOf,
  requireCapability,
  resolveWithDependencies,
  validateAirCapabilities,
} from "../src";

const codes = (slice: AirCapabilitySlice): string[] =>
  validateAirCapabilities(slice).map((d) => d.code);

describe("résolution", () => {
  it("refuse net une capability hors registre (allowlist positive)", () => {
    expect(() => requireCapability("bluetooth")).toThrow(UnknownCapabilityError);
    expect(() => resolveWithDependencies(["camera", "bluetooth"])).toThrow(
      UnknownCapabilityError,
    );
  });

  it("résout la fermeture transitive : barcode_scan entraîne camera", () => {
    const closure = resolveWithDependencies(["barcode_scan"]);
    expect(closure.map((c) => c.id)).toEqual(["barcode_scan", "camera"]);
  });

  it("est déterministe : même entrée dans un autre ordre ⇒ même sortie", () => {
    const a = resolveWithDependencies(["maps", "auth", "camera"]);
    const b = resolveWithDependencies(["camera", "maps", "auth"]);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });
});

describe("empreinte native (autorité du Router)", () => {
  it("un ensemble purement JS reste OTA-compatible", () => {
    expect(nativeFootprintOf(["auth"])).toEqual({
      impact: "none",
      nativeModules: [],
      requiresRebuild: false,
    });
  });

  it("l'empreinte remonte par les dépendances : barcode_scan seul ⇒ heavy via camera", () => {
    const footprint = nativeFootprintOf(["barcode_scan"]);
    expect(footprint.impact).toBe("heavy");
    expect(footprint.requiresRebuild).toBe(true);
    expect(footprint.nativeModules).toContain("expo-camera");
  });

  it("agrège le max d'impact et l'union triée des modules", () => {
    const footprint = nativeFootprintOf(["biometrics", "maps"]);
    expect(footprint.impact).toBe("heavy");
    expect(footprint.nativeModules).toEqual([
      "expo-local-authentication",
      "react-native-maps",
    ]);
  });
});

describe("permissions induites", () => {
  it("agrège et déduplique sur la fermeture, tri stable", () => {
    const permissions = inducedPermissionsFor(["barcode_scan", "geolocation"]);
    const keys = permissions.map((p) => `${p.platform} ${p.permission}`);
    expect(keys).toEqual([
      "android android.permission.ACCESS_FINE_LOCATION",
      "android android.permission.CAMERA",
      "android android.permission.RECORD_AUDIO",
      "ios NSCameraUsageDescription",
      "ios NSLocationWhenInUseUsageDescription",
      "ios NSMicrophoneUsageDescription",
    ]);
    // La provenance est portée : la caméra vient de la dépendance, pas du nœud demandé.
    expect(
      permissions.find((p) => p.permission === "NSCameraUsageDescription")?.requiredByCapability,
    ).toBe("camera");
  });
});

describe("conflits", () => {
  it("détecte la paire PSP ↔ IAP une seule fois, triée", () => {
    expect(findConflicts(["payments.psp", "payments.iap", "auth"])).toEqual([
      ["payments.iap", "payments.psp"],
    ]);
    expect(findConflicts(["payments.psp", "auth"])).toEqual([]);
  });
});

describe("validateAirCapabilities (pont AIR ↔ registre)", () => {
  const validSlice = (): AirCapabilitySlice => ({
    capabilities: [{ capability: "payments.psp" }, { capability: "geolocation" }],
    permissions: [
      {
        platform: "ios",
        permission: "NSLocationWhenInUseUsageDescription",
        requiredByCapability: "geolocation",
      },
      {
        platform: "android",
        permission: "android.permission.ACCESS_FINE_LOCATION",
        requiredByCapability: "geolocation",
      },
    ],
    compliance: { commerceClass: "physical_or_offapp" },
  });

  it("zéro diagnostic sur une tranche cohérente", () => {
    expect(validateAirCapabilities(validSlice())).toEqual([]);
  });

  it("signale une capability hors registre", () => {
    const slice = validSlice();
    slice.capabilities = [...slice.capabilities, { capability: "bluetooth" }];
    expect(codes(slice)).toContain("CAP_UNKNOWN");
  });

  it("signale le conflit PSP ↔ IAP", () => {
    const slice = validSlice();
    slice.capabilities = [...slice.capabilities, { capability: "payments.iap" }];
    expect(codes(slice)).toContain("CAP_CONFLICT");
  });

  it("refuse un PSP dans une app digitale et un IAP dans une app physique", () => {
    const digital = validSlice();
    digital.compliance = { commerceClass: "digital" };
    expect(codes(digital)).toContain("CAP_COMMERCE_INCOMPATIBLE");

    const physical: AirCapabilitySlice = {
      capabilities: [{ capability: "payments.iap" }],
      permissions: [],
      compliance: { commerceClass: "physical_or_offapp" },
    };
    expect(codes(physical)).toContain("CAP_COMMERCE_INCOMPATIBLE");
  });

  it("exige la déclaration dans l'AIR de toute permission induite (y compris transitive)", () => {
    const slice: AirCapabilitySlice = {
      capabilities: [{ capability: "barcode_scan" }],
      permissions: [],
      compliance: { commerceClass: "none" },
    };
    const diagnostics = validateAirCapabilities(slice);
    const missing = diagnostics.filter((d) => d.code === "CAP_PERMISSION_NOT_DECLARED");
    expect(missing.length).toBeGreaterThanOrEqual(4);
    expect(missing.some((d) => d.message.includes("NSCameraUsageDescription"))).toBe(true);
  });

  it("accepte une déclaration platform=both pour couvrir les deux plateformes", () => {
    const slice: AirCapabilitySlice = {
      capabilities: [{ capability: "biometrics" }],
      permissions: [
        { platform: "ios", permission: "NSFaceIDUsageDescription", requiredByCapability: "biometrics" },
        { platform: "android", permission: "android.permission.USE_BIOMETRIC", requiredByCapability: "biometrics" },
      ],
      compliance: { commerceClass: "none" },
    };
    expect(validateAirCapabilities(slice)).toEqual([]);
  });

  it("produit une sortie triée déterministe", () => {
    const slice: AirCapabilitySlice = {
      capabilities: [{ capability: "barcode_scan" }, { capability: "bluetooth" }],
      permissions: [],
      compliance: { commerceClass: "none" },
    };
    const first = validateAirCapabilities(slice);
    expect(first).toEqual(validateAirCapabilities(slice));
    const paths = first.map((d) => d.path);
    expect(paths).toEqual([...paths].sort());
  });
});
