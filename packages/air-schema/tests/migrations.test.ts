import { describe, expect, it } from "vitest";
import type { AirMigration } from "../src";
import {
  AIR_MIGRATIONS,
  AirMigrationError,
  AirSemanticError,
  migrateAirDocument,
} from "../src";
import { buildValidAir } from "./fixtures";

// Migrations synthétiques : le schéma v1.0.0 est la première version publiée,
// le registre réel est donc vide — le MÉCANISME, lui, est prouvé ici.
const renameViewsToScreens: AirMigration = {
  from: "0.9.0",
  to: "1.0.0",
  description: "0.9 nommait `views` ce que 1.0 nomme `screens`",
  migrate: (document) => {
    const { views, ...rest } = document;
    return { ...rest, screens: views };
  },
};

const noop080: AirMigration = {
  from: "0.8.0",
  to: "0.9.0",
  description: "étape intermédiaire sans transformation",
  migrate: (document) => document,
};

function buildLegacyAir(version: string): Record<string, unknown> {
  const air = buildValidAir() as unknown as Record<string, unknown>;
  const { screens, ...rest } = air;
  return { ...rest, airSchemaVersion: version, views: screens };
}

describe("migrateAirDocument", () => {
  it("le registre réel est vide : v1.0.0 est la première version publiée", () => {
    expect(AIR_MIGRATIONS).toHaveLength(0);
  });

  it("valide directement un document déjà à la version courante", () => {
    const air = migrateAirDocument(buildValidAir());
    expect(air.projectId).toBe("prj_resto_demo");
  });

  it("migre un document d'une version antérieure jusqu'à la version courante", () => {
    const migrated = migrateAirDocument(buildLegacyAir("0.9.0"), [renameViewsToScreens]);
    expect(migrated.airSchemaVersion).toBe("1.0.0");
    expect(migrated.screens).toHaveLength(2);
  });

  it("chaîne plusieurs migrations dans l'ordre des versions", () => {
    const migrated = migrateAirDocument(buildLegacyAir("0.8.0"), [
      renameViewsToScreens,
      noop080,
    ]);
    expect(migrated.airSchemaVersion).toBe("1.0.0");
  });

  it("refuse une version sans chemin de migration", () => {
    expect(() => migrateAirDocument(buildLegacyAir("0.1.0"), [renameViewsToScreens])).toThrow(
      AirMigrationError,
    );
  });

  it("refuse un document sans airSchemaVersion et un non-objet", () => {
    expect(() => migrateAirDocument({})).toThrow(AirMigrationError);
    expect(() => migrateAirDocument("air")).toThrow(AirMigrationError);
    expect(() => migrateAirDocument([])).toThrow(AirMigrationError);
  });

  it("détecte un cycle de migrations au lieu de boucler", () => {
    const cycleA: AirMigration = {
      from: "0.9.0",
      to: "0.8.0",
      description: "cycle volontaire",
      migrate: (d) => d,
    };
    expect(() => migrateAirDocument(buildLegacyAir("0.9.0"), [cycleA, noop080])).toThrow(
      /cycle/,
    );
  });

  it("reste fail-closed : une migration qui produit un AIR incohérent échoue", () => {
    const corrupting: AirMigration = {
      from: "0.9.0",
      to: "1.0.0",
      description: "migration défectueuse : perd les écrans référencés",
      migrate: (document) => {
        const { views, ...rest } = document;
        const screens = (views as unknown[]).slice(0, 1);
        return { ...rest, screens };
      },
    };
    expect(() => migrateAirDocument(buildLegacyAir("0.9.0"), [corrupting])).toThrow(
      AirSemanticError,
    );
  });

  it("une migration ne peut pas sauter de version : le runner fixe `to`", () => {
    const lying: AirMigration = {
      from: "0.9.0",
      to: "0.9.5",
      description: "prétend aller ailleurs que sa cible déclarée",
      migrate: (document) => {
        const { views, ...rest } = document;
        return { ...rest, screens: views, airSchemaVersion: "1.0.0" };
      },
    };
    // Le runner écrase airSchemaVersion avec step.to : le document repart de
    // 0.9.5 et il n'existe pas de migration depuis 0.9.5 → erreur nette.
    expect(() => migrateAirDocument(buildLegacyAir("0.9.0"), [lying])).toThrow(
      AirMigrationError,
    );
  });
});
