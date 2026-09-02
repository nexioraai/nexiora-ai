// E3.2 (D-130) — `dataset.source` : union fermée, fail-closed, identité de
// migration. Cas-tueurs : la provenance se DÉCLARE, elle ne se prétend pas.
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

describe("contrat — union fermée seed | remote", () => {
  it("🟢 sans `source` : document historique accepté tel quel (1.6.0 → 1.7.0 identité)", () => {
    const m = migrateAirDocument(bus());
    expect(m.airSchemaVersion).toBe(AIR_SCHEMA_VERSION);
    expect(m.datasets.every((d) => d.source === undefined)).toBe(true);
  });

  it("l'identité de migration ne touche AUCUN contenu : seuls les octets de version bougent", () => {
    const doc = bus();
    const m1 = migrateAirDocument(doc);
    const rejoue = migrateAirDocument(JSON.parse(JSON.stringify(m1)) as Record<string, unknown>);
    expect(hashCanonical(rejoue)).toBe(hashCanonical(m1)); // idempotence stricte
  });

  it("🟢 `remote` complet et cohérent est accepté par le schéma ET le validateur", () => {
    const doc = migrateAirDocument(bus());
    const avec = {
      ...doc,
      datasets: doc.datasets.map((d, i) =>
        i !== 0
          ? d
          : {
              ...d,
              source: {
                kind: "remote" as const,
                integrationId: doc.integrations[0]?.id ?? "intg_x",
                domain: doc.network.allowedDomains[0] ?? "api.deribfy.app",
              },
            },
      ),
    };
    expect(validateAir(avec).filter((x) => x.code.startsWith("AIR_DATASET_SOURCE"))).toEqual([]);
  });

  it("🔴 `remote` vers une intégration INCONNUE → refus fail-closed", () => {
    const doc = migrateAirDocument(bus());
    const avec = {
      ...doc,
      datasets: doc.datasets.map((d, i) =>
        i !== 0
          ? d
          : { ...d, source: { kind: "remote" as const, integrationId: "intg_fantome", domain: doc.network.allowedDomains[0] ?? "api.deribfy.app" } },
      ),
    };
    expect(validateAir(avec).map((x) => x.code)).toContain("AIR_DATASET_SOURCE_INTEGRATION_UNKNOWN");
  });

  it("🔴 `remote` vers un domaine NON AUTORISÉ (deny_by_default) → refus", () => {
    const doc = migrateAirDocument(bus());
    const avec = {
      ...doc,
      datasets: doc.datasets.map((d, i) =>
        i !== 0
          ? d
          : { ...d, source: { kind: "remote" as const, integrationId: doc.integrations[0]?.id ?? "intg_x", domain: "exfiltration.example.com" } },
      ),
    };
    expect(validateAir(avec).map((x) => x.code)).toContain("AIR_DATASET_SOURCE_DOMAIN");
  });
});
