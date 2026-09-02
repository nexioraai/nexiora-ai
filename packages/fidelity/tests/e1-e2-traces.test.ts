// E1/E2 (D-129) — TRACES D'INSTRUMENT : une fausse recherche pilotée est
// réfutable, une pseudo-relation est mesurable. Killer GRATUIT sur le corpus
// scellé : billetterie-concerts (patron « lieu → concerts » démontré NON
// scopé par D-126) doit rendre une trace relationScoping ABSENTE.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrateAirDocument } from "@deribfy/air-schema";
import { tracesManquantes } from "../src/intent.ts";
import { EXECUTION_ENVELOPE_V1 } from "@deribfy/execution-contract";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus");
const charger = (nom: string) =>
  migrateAirDocument(JSON.parse(readFileSync(join(RACINE, "corpus-v3", `${nom}.air.json`), "utf8")));
// Enveloppe où E1/E2 seraient déclarés disponibles — pour tester la TRACE
// indépendamment de la bascule réelle (D-060) des faits.
const ENV_E12 = { ...EXECUTION_ENVELOPE_V1, listUserFiltering: true, relationScoping: true };

describe("E1 — la fausse recherche pilotée est réfutable", () => {
  it("🔴 KILLER : « selon plusieurs critères » sans userFilterFieldIds → trace MANQUANTE", () => {
    const bus = charger("bus-intercites"); // aucun userFilterFieldIds au corpus
    expect(tracesManquantes("Filtrer les départs selon plusieurs critères", bus, ENV_E12))
      .toContain("listUserFiltering");
  });

  it("🟢 CONTRÔLE : la trace présente lève la réfutation", () => {
    const bus = charger("bus-intercites");
    const avec = {
      ...bus,
      screens: bus.screens.map((s, i) =>
        i !== 0 ? s : { ...s, blocks: s.blocks.map((b) =>
          b.blockType !== "list" ? b : { ...b, props: [...(b.props ?? []), { key: "userFilterFieldIds", value: ["fld_x"] }] },
        ) },
      ),
    };
    expect(tracesManquantes("Filtrer selon plusieurs critères", avec as never, ENV_E12))
      .not.toContain("listUserFiltering");
  });
});

describe("E2 — la pseudo-relation est mesurable à la trace", () => {
  it("🔴 KILLER (corpus scellé) : billetterie ne porte AUCUNE trace de scope", () => {
    const b = charger("billetterie-concerts");
    const scope = b.screens.some((s) =>
      s.blocks.some((bl) => (bl.props ?? []).some((p) => p.key === "scopeFieldId")));
    expect(scope).toBe(false); // « lieu → concerts » était vivant mais NON scopé (D-126)
  });
});
