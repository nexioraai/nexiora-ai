// D-099 — REJEU DU CAS RÉEL P6, sur le document d'une génération PAYÉE.
//
// La génération P6 (2,7396 $) a produit un document VALIDE dont trois promesses
// étaient signalées à tort comme cibles mortes : `scr_prestations` et
// `scr_compte` sont des destinations de `navigation.primary` et n'étaient
// atteignables que par la barre — que `reachableScreens` ignorait.
//
// Ce test rejoue le document ACCEPTÉ tel quel. Il ne simule rien, et une
// régression de l'oracle le fera échouer sur des données que nous ne pourrons
// pas reproduire sans repayer.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// 1.7.0 (E3.2) : lecture par le chemin CANONIQUE — un parse brut ne
// tolérait que les documents à la version exacte du schéma (fragilité
// latente, révélée par la montée de version).
import { migrateAirDocument } from "@deribfy/air-schema";
import { EXECUTION_ENVELOPE_V1, reachableScreens } from "@deribfy/execution-contract";
import { evaluateIntentCoverage, evaluatePromises } from "../src/index.ts";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const air = migrateAirDocument(
  JSON.parse(
    readFileSync(join(RACINE, "packages/golden-corpus/corpus-v3/plombier-urgence.air.json"), "utf8"),
  ),
);

describe("P6 — le document accepté est fidèle", () => {
  it("le document porte bien une navigation primaire à 4 destinations", () => {
    expect(air.navigation.primary?.destinations).toHaveLength(4);
  });

  it("C · les deux écrans accessibles PAR LA BARRE SEULE sont vivants", () => {
    const vivants = new Set(reachableScreens(air, EXECUTION_ENVELOPE_V1.triggers));
    expect(vivants.has("scr_prestations"), "scr_prestations").toBe(true);
    expect(vivants.has("scr_compte"), "scr_compte").toBe(true);
  });

  it("C · les trois promesses ne sont plus signalées à cible morte", () => {
    const f1 = evaluatePromises(air, EXECUTION_ENVELOPE_V1);
    const mortes = new Set(
      f1.verdicts.filter((v) => v.state === "cible_morte").map((v) => v.testId),
    );
    for (const t of [
      "test_recherche_prestations",
      "test_vignettes_prestations",
      "test_contrat_auth_client",
    ]) {
      expect(mortes.has(t), t).toBe(false);
    }
  });

  it("F1 PASSE : 42 promesses sur 42 ont une cible vivante", () => {
    const f1 = evaluatePromises(air, EXECUTION_ENVELOPE_V1);
    expect(f1.vivantes).toBe(f1.declared);
    expect(f1.passed).toBe(true);
  });

  it("F4 PASSE : aucun besoin perdu, aucun motif réfuté", () => {
    const f4 = evaluateIntentCoverage(air, EXECUTION_ENVELOPE_V1);
    expect(f4.defaillants).toBe(0);
    expect(f4.passed).toBe(true);
    // Les deux seuls besoins écartés relèvent d'un organe de l'appareil.
    expect(f4.inexprimables).toBe(2);
  });

  it("le générateur a CONSTRUIT : images et recherche, aucune promesse abusive", () => {
    const props = air.screens.flatMap((s) => s.blocks.flatMap((b) => b.props ?? []));
    expect(props.filter((p) => p.key === "imageFieldId")).toHaveLength(8);
    expect(props.filter((p) => p.key === "searchFieldId")).toHaveLength(1);
    expect(air.expectedTests.filter((t) => t.id.includes("besoin_non_rendable"))).toHaveLength(0);
  });
});
