import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  CAPABILITY_REGISTRY_VERSION,
  capabilityDefinitionSchema,
  getCapability,
} from "../src";

// CLIQUETS DE REGISTRE (ROADMAP Phase 2) : ces tests verrouillent les
// invariants structurels du registre. Ajouter/retirer une capability ou
// affaiblir un invariant DOIT faire échouer un test ici — la modification du
// cliquet est alors un acte conscient, revu, jamais un effet de bord.

// Liste v1 EXACTE — GELÉE (D-020, revue propriétaire du 2026-08-27).
// Règle d'évolution post-gel : AJOUT compatible = décision consignée dans
// DECISIONS.md + édition consciente de cette liste + version MINEURE du
// registre ; retrait/renommage/changement de contrat = RUPTURE (décision +
// migration d'AIR éventuelle + version MAJEURE).
const V1_CAPABILITY_IDS = [
  "analytics",
  "auth",
  "barcode_scan",
  "biometrics",
  "calendar",
  "camera",
  "deep_links",
  "geolocation",
  "maps",
  "media_upload",
  "offline_storage",
  "payments.iap",
  "payments.psp",
  "push_notifications",
  "share",
];

describe("cliquets de registre", () => {
  it("le registre v1 est GELÉ en 1.0.0 et chaque contrat porte la version 1.0.0 (D-020)", () => {
    expect(CAPABILITY_REGISTRY_VERSION).toBe("1.0.0");
    for (const c of CAPABILITIES) {
      expect(c.version, c.id).toBe("1.0.0");
    }
  });

  it("contient EXACTEMENT les 15 capabilities cœur v1, triées", () => {
    expect(CAPABILITIES.map((c) => c.id)).toEqual(V1_CAPABILITY_IDS);
  });

  it("chaque entrée passe le schéma strict du registre", () => {
    for (const definition of CAPABILITIES) {
      expect(capabilityDefinitionSchema.safeParse(definition).success).toBe(true);
    }
  });

  it("compatibilité OTA ⇒ aucune empreinte native ni rebuild", () => {
    for (const c of CAPABILITIES) {
      if (c.otaCompatible) {
        expect(c.nativeFootprint.impact, c.id).toBe("none");
        expect(c.requiresRebuild, c.id).toBe(false);
      }
    }
  });

  it("empreinte native non nulle ⇒ rebuild exigé (et réciproquement pour none)", () => {
    for (const c of CAPABILITIES) {
      if (c.nativeFootprint.impact !== "none") {
        expect(c.requiresRebuild, c.id).toBe(true);
      } else {
        expect(c.nativeFootprint.nativeModules, c.id).toEqual([]);
        expect(c.otaCompatible, c.id).toBe(true);
      }
    }
  });

  it("cohérence impact ↔ profils de runtime (none⊇core, light⊇standard, heavy=extended)", () => {
    for (const c of CAPABILITIES) {
      const profiles = c.compatibleRuntimeProfiles;
      if (c.nativeFootprint.impact === "none") {
        expect(profiles, c.id).toContain("core");
      }
      if (c.nativeFootprint.impact === "light") {
        expect(profiles, c.id).toContain("standard");
        expect(profiles, c.id).not.toContain("core");
      }
      if (c.nativeFootprint.impact === "heavy") {
        expect(profiles, c.id).toEqual(["extended"]);
      }
    }
  });

  it("toutes les dépendances existent, sans auto-dépendance ni cycle", () => {
    for (const c of CAPABILITIES) {
      for (const dependency of c.dependencies.capabilities) {
        expect(getCapability(dependency), `${c.id} → ${dependency}`).toBeDefined();
        expect(dependency, c.id).not.toBe(c.id);
      }
    }
    // Détection de cycle par DFS sur tout le graphe.
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string): void => {
      if (done.has(id)) return;
      expect(visiting.has(id), `cycle de dépendances via ${id}`).toBe(false);
      visiting.add(id);
      for (const dep of (getCapability(id)?.dependencies.capabilities ?? [])) {
        visit(dep);
      }
      visiting.delete(id);
      done.add(id);
    };
    for (const c of CAPABILITIES) {
      visit(c.id);
    }
  });

  it("tous les conflits existent, sont symétriques, sans auto-conflit", () => {
    for (const c of CAPABILITIES) {
      for (const conflict of c.conflicts) {
        expect(conflict, c.id).not.toBe(c.id);
        const other = getCapability(conflict);
        expect(other, `${c.id} ↔ ${conflict}`).toBeDefined();
        expect(other?.conflicts, `symétrie ${conflict} ↔ ${c.id}`).toContain(c.id);
      }
    }
  });

  it("chaque permission induite vise une plateforme supportée et figure dans la config native", () => {
    for (const c of CAPABILITIES) {
      for (const p of c.inducedPermissions) {
        expect(c.platforms[p.platform].supported, `${c.id} ${p.permission}`).toBe(true);
        const declared =
          p.platform === "ios"
            ? c.nativeConfig.infoPlistKeys
            : c.nativeConfig.androidManifestPermissions;
        expect(declared, `${c.id} ${p.permission}`).toContain(p.permission);
      }
    }
  });

  it("contrainte de classe commerce ⇔ capability de paiement", () => {
    for (const c of CAPABILITIES) {
      const isPayment = c.id.startsWith("payments.");
      expect(c.commerceConstraint !== "none", c.id).toBe(isPayment);
    }
  });

  it("les deux voies de paiement sont mutuellement exclusives (classe commerce unique par app)", () => {
    expect(getCapability("payments.psp")?.conflicts).toContain("payments.iap");
    expect(getCapability("payments.iap")?.conflicts).toContain("payments.psp");
  });
});
