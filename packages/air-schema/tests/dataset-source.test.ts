// E3.2 (D-130) puis E3.3 (D-131) — provenance d'un dataset, forme APLANIE :
// l'union fermée 1.7.0 était refusée par l'API réelle à tous les niveaux de
// l'échelle (« compiled grammar is too large », sonde différentielle du
// 2026-09-02) ; la forme plate porte la MÊME sémantique — fail-closed,
// identité de migration. Cas-tueurs : la provenance se DÉCLARE, elle ne se
// prétend pas — et la forme plate n'accepte QUE ce que l'union acceptait.
import { describe, expect, it } from "vitest";
import {
  AIR_SCHEMA_VERSION,
  hashCanonical,
  migrateAirDocument,
  validateAir,
} from "../src";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus");
const bus = () =>
  JSON.parse(readFileSync(join(CORPUS, "corpus-v3", "bus-intercites.air.json"), "utf8")) as Record<
    string,
    unknown
  >;

// Patch PLAT du premier dataset d'un document déjà migré (chemin canonique).
const avecProvenance = (doc: ReturnType<typeof migrateAirDocument>, patch: object) => ({
  ...doc,
  datasets: doc.datasets.map((d, i) => (i !== 0 ? d : { ...d, ...patch })),
});

// Patch BRUT (avant parse) du premier dataset : pour les refus de FORME.
const brutAvec = (patch: object) => {
  const brut = bus();
  const datasets = brut.datasets as Record<string, unknown>[];
  datasets[0] = { ...datasets[0], ...patch };
  return brut;
};

describe("contrat — provenance aplanie seed | remote", () => {
  it("🟢 sans provenance : document historique accepté tel quel (identité jusqu'à 1.7.1)", () => {
    const m = migrateAirDocument(bus());
    expect(m.airSchemaVersion).toBe(AIR_SCHEMA_VERSION);
    expect(m.datasets.every((d) => d.sourceKind === undefined)).toBe(true);
  });

  it("l'identité de migration ne touche AUCUN contenu : seuls les octets de version bougent", () => {
    const m1 = migrateAirDocument(bus());
    const rejoue = migrateAirDocument(JSON.parse(JSON.stringify(m1)) as Record<string, unknown>);
    expect(hashCanonical(rejoue)).toBe(hashCanonical(m1)); // idempotence stricte
  });

  it("🟢 `remote` complet et cohérent est accepté par le schéma ET le validateur", () => {
    const doc = migrateAirDocument(bus());
    const avec = avecProvenance(doc, {
      sourceKind: "remote" as const,
      sourceIntegrationId: doc.integrations[0]?.id ?? "intg_x",
      sourceDomain: doc.network.allowedDomains[0] ?? "api.deribfy.app",
    });
    expect(validateAir(avec).filter((x) => x.code.startsWith("AIR_DATASET_SOURCE"))).toEqual([]);
  });

  it("🔴 `remote` vers une intégration INCONNUE → refus fail-closed", () => {
    const doc = migrateAirDocument(bus());
    const avec = avecProvenance(doc, {
      sourceKind: "remote" as const,
      sourceIntegrationId: "intg_fantome",
      sourceDomain: doc.network.allowedDomains[0] ?? "api.deribfy.app",
    });
    expect(validateAir(avec).map((x) => x.code)).toContain("AIR_DATASET_SOURCE_INTEGRATION_UNKNOWN");
  });

  it("🔴 `remote` vers un domaine NON AUTORISÉ (deny_by_default) → refus", () => {
    const doc = migrateAirDocument(bus());
    const avec = avecProvenance(doc, {
      sourceKind: "remote" as const,
      sourceIntegrationId: doc.integrations[0]?.id ?? "intg_x",
      sourceDomain: "exfiltration.example.com",
    });
    expect(validateAir(avec).map((x) => x.code)).toContain("AIR_DATASET_SOURCE_DOMAIN");
  });
});

describe("cohérence de FORME — aucune combinaison incohérente n'entre (superRefine)", () => {
  it("🔴 `remote` SANS sourceIntegrationId → refus au parse", () => {
    const brut = brutAvec({ sourceKind: "remote", sourceDomain: "api.deribfy.app" });
    expect(() => migrateAirDocument(brut)).toThrow(/sourceIntegrationId/);
  });

  it("🔴 `remote` SANS sourceDomain → refus au parse", () => {
    const brut = brutAvec({ sourceKind: "remote", sourceIntegrationId: "intg_x" });
    expect(() => migrateAirDocument(brut)).toThrow(/sourceDomain/);
  });

  it("🔴 `seed` avec un champ remote → refus (source locale n'admet rien)", () => {
    const brut = brutAvec({ sourceKind: "seed", sourceDomain: "api.deribfy.app" });
    expect(() => migrateAirDocument(brut)).toThrow(/seed/);
  });

  it("🔴 champ source* SANS sourceKind → refus (provenance incohérente)", () => {
    const brut = brutAvec({ sourceIntegrationId: "intg_x" });
    expect(() => migrateAirDocument(brut)).toThrow(/sourceKind/);
  });

  it("🔴 sourceRefreshSeconds avec `seed` → refus", () => {
    const brut = brutAvec({ sourceKind: "seed", sourceRefreshSeconds: 60 });
    expect(() => migrateAirDocument(brut)).toThrow(/seed/);
  });

  it("🔴 la forme UNION 1.7.0 historique est REFUSÉE au parse — fail-closed, jamais reprise en silence", () => {
    const brut = brutAvec({
      source: { kind: "remote", integrationId: "intg_x", domain: "api.deribfy.app" },
    });
    expect(() => migrateAirDocument(brut)).toThrow(); // strictObject : clé inconnue `source`
  });
});
