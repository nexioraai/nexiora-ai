import { describe, expect, it } from "vitest";
import {
  deploymentStateSchema,
  projectAirSchema,
  projectLockSchema,
} from "../src";
import { at } from "./at";
import {
  buildValidAir,
  buildValidDeploymentState,
  buildValidLock,
} from "./fixtures";

const asRecord = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;

describe("projectAirSchema", () => {
  it("accepte l'AIR de référence", () => {
    expect(projectAirSchema.safeParse(buildValidAir()).success).toBe(true);
  });

  it("rejette toute clé inconnue (objets stricts à tous les niveaux)", () => {
    const air = asRecord(buildValidAir());
    air.extra = true;
    expect(projectAirSchema.safeParse(air).success).toBe(false);

    const nested = buildValidAir();
    asRecord(at(nested.screens, 0)).extra = true;
    expect(projectAirSchema.safeParse(nested).success).toBe(false);
  });

  it("rejette une version de schéma inconnue", () => {
    const air = asRecord(buildValidAir());
    air.airSchemaVersion = "9.9.9";
    expect(projectAirSchema.safeParse(air).success).toBe(false);
  });

  it("rejette un identifiant au mauvais préfixe (identités stables typées)", () => {
    const air = buildValidAir();
    asRecord(at(air.screens, 0)).id = "ent_menu";
    expect(projectAirSchema.safeParse(air).success).toBe(false);
  });

  it("rejette un hash de dataset non hexadécimal", () => {
    const air = buildValidAir();
    asRecord(at(air.datasets, 0)).contentHash = "Z".repeat(64);
    expect(projectAirSchema.safeParse(air).success).toBe(false);
  });

  it("rejette un effet d'action hors du vocabulaire fermé", () => {
    const air = buildValidAir();
    asRecord(at(air.actions, 0)).effect = { kind: "eval", code: "alert(1)" };
    expect(projectAirSchema.safeParse(air).success).toBe(false);
  });

  it("rejette une politique réseau autre que deny_by_default", () => {
    const air = buildValidAir();
    asRecord(air.network).policy = "allow_all";
    expect(projectAirSchema.safeParse(air).success).toBe(false);
  });

  it("rejette une locale mal formée", () => {
    const air = buildValidAir();
    asRecord(air.app.locales).userLanguage = "français";
    expect(projectAirSchema.safeParse(air).success).toBe(false);
  });
});

describe("projectLockSchema", () => {
  it("accepte le lock de référence", () => {
    expect(projectLockSchema.safeParse(buildValidLock()).success).toBe(true);
  });

  it("rejette un horodatage : le lock est un artefact déterministe", () => {
    const lock = asRecord(buildValidLock());
    lock.generatedAt = "2026-08-27T12:00:00Z";
    expect(projectLockSchema.safeParse(lock).success).toBe(false);
  });
});

describe("deploymentStateSchema", () => {
  it("accepte l'état de déploiement de référence", () => {
    expect(deploymentStateSchema.safeParse(buildValidDeploymentState()).success).toBe(true);
  });

  it("rejette un horodatage non ISO sur un canal OTA", () => {
    const state = buildValidDeploymentState();
    asRecord(at(state.otaChannels, 0)).updatedAt = "hier";
    expect(deploymentStateSchema.safeParse(state).success).toBe(false);
  });
});
