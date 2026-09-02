// E3.3 (D-132) — RÉSOLUTION LOCK ET ÉMISSION des cibles distantes.
// L'AIR déclare (1.7.1), le LOCK lie (endpoint du protocole de données du
// moteur), l'app émise applique — et un document SANS provenance reste
// émis À L'IDENTIQUE (additivité stricte, patron D-058).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalJson, migrateAirDocument } from "@deribfy/air-schema";
import { emitProject } from "../src/emit-project.ts";
import { LockResolutionError, resolveLock, resoudreCiblesRemote, urlProtocoleDonnees } from "../src/resolve-lock.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus");
const bus = () =>
  JSON.parse(readFileSync(join(CORPUS, "corpus-v3", "bus-intercites.air.json"), "utf8")) as Record<
    string,
    unknown
  >;

/** Bus + provenance distante VALIDE sur data_departs (intégration et domaine réels du document). */
const busRemote = () => {
  const doc = migrateAirDocument(bus());
  return {
    ...doc,
    datasets: doc.datasets.map((d) =>
      d.id !== "data_departs"
        ? d
        : {
            ...d,
            sourceKind: "remote" as const,
            sourceIntegrationId: "intg_cache_billets",
            sourceDomain: "api.bus-intercites.app",
            sourceRefreshSeconds: 60,
          },
    ),
  };
};

describe("résolution LOCK — l'endpoint naît ici, jamais dans l'AIR", () => {
  it("🟢 cible résolue : url du protocole moteur, intégration et cadence PRÉSERVÉES", () => {
    const lock = resolveLock(busRemote());
    expect(lock.lockSchemaVersion).toBe("1.1.0");
    expect(lock.resolved.remoteData).toEqual([
      {
        datasetId: "data_departs",
        entityId: "ent_depart",
        integrationId: "intg_cache_billets",
        url: "https://api.bus-intercites.app/air/v1/entities/ent_depart/rows",
        refreshSeconds: 60,
      },
    ]);
    expect(urlProtocoleDonnees("d.tld", "ent_x")).toBe("https://d.tld/air/v1/entities/ent_x/rows");
  });

  it("🟢 13 · document SANS provenance : remoteData ABSENT (pas []) — lock historique intact", () => {
    const lock = resolveLock(bus());
    expect("remoteData" in lock.resolved).toBe(false);
    expect(canonicalJson(lock).includes("remoteData")).toBe(false);
    expect(resoudreCiblesRemote(migrateAirDocument(bus()))).toEqual([]);
  });

  it("🔴 4 · intégration INCONNUE : refus fail-closed AVANT toute résolution", () => {
    const doc = {
      ...busRemote(),
      datasets: migrateAirDocument(bus()).datasets.map((d) =>
        d.id !== "data_departs"
          ? d
          : { ...d, sourceKind: "remote" as const, sourceIntegrationId: "intg_fantome", sourceDomain: "api.bus-intercites.app" },
      ),
    };
    expect(() => resolveLock(doc)).toThrow(LockResolutionError);
    try {
      resolveLock(doc);
    } catch (e) {
      expect((e as LockResolutionError).diagnostics.map((x) => x.code)).toContain(
        "AIR_DATASET_SOURCE_INTEGRATION_UNKNOWN",
      );
    }
  });

  it("🔴 5 · domaine hors allowedDomains : refus fail-closed au document", () => {
    const doc = {
      ...busRemote(),
      datasets: migrateAirDocument(bus()).datasets.map((d) =>
        d.id !== "data_departs"
          ? d
          : { ...d, sourceKind: "remote" as const, sourceIntegrationId: "intg_cache_billets", sourceDomain: "exfiltration.example.com" },
      ),
    };
    expect(() => resolveLock(doc)).toThrow(LockResolutionError);
  });
});

describe("émission — l'app applique le lock, l'historique reste identique", () => {
  it("🟢 câblage remote émis : magasin + adaptateur + cibles du LOCK + politique de domaines", () => {
    const { files, lock } = emitProject(busRemote());
    const app = files.get("App.tsx") ?? "";
    expect(app).toContain('from "./lib/runtime/source-reseau"');
    expect(app).toContain("const provider = creerMagasin(demoData);");
    expect(app).toContain(`const CIBLES_REMOTE = ${canonicalJson(lock.resolved.remoteData)} as const;`);
    expect(app).toContain('const DOMAINES_AUTORISES = ["api.bus-intercites.app"] as const;');
    expect(app).toContain("transport: transportHttp,");
    expect(app).toContain("void adaptateur.demarrer();");
    expect(app).not.toContain("buildDemoProvider");
    // le runtime embarqué contient le module réseau
    expect(files.has("lib/runtime/source-reseau.ts")).toBe(true);
  });

  it("🟢 13 · document SANS provenance : App.tsx au patron HISTORIQUE, aucun marqueur réseau", () => {
    const { files } = emitProject(bus());
    const app = files.get("App.tsx") ?? "";
    expect(app).toContain("const provider = buildDemoProvider(demoData);");
    expect(app).not.toContain("source-reseau");
    expect(app).not.toContain("CIBLES_REMOTE");
    expect(app).not.toContain("adaptateur");
  });
});
