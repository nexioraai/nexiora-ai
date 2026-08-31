// CAS-TUEURS DE LA GATE DES PROMESSES — critère F2 de la PHASE 10B.
//
// RÈGLE FONDAMENTALE (`GATE_REGISTER`) : une gate n'est PAS validée parce
// qu'elle existe. Tant qu'elle n'a pas été VUE ÉCHOUER sur des défauts réels,
// sa validité est UNKNOWN. Ce fichier la fait échouer sur quatre familles de
// défauts distinctes, plus la tentative de contournement par le silence.
//
// Base de tous les cas : un document du corpus GELÉ, migré en mémoire (patron
// D-044) — jamais réécrit. Une seule mutation par cas, pour que ce soit la
// mutation, et elle seule, qui explique le verdict.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrateAirDocument, type ProjectAir } from "@deribfy/air-schema";
import { EXECUTION_ENVELOPE_V1, controls, dataBindings, reachableScreens } from "@deribfy/execution-contract";
import { evaluatePromises } from "../src/promises.ts";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus", "corpus-v2");
const base = (): ProjectAir =>
  migrateAirDocument(JSON.parse(readFileSync(join(CORPUS, "resto-quartier.air.json"), "utf8")));

const promesse = (targetId: string, id = "test_cas") =>
  ({ id, description: "promesse du cas de test", kind: "e2e" as const, targetId });

/** Un document dont TOUTES les promesses portent sur des cibles vivantes. */
function documentSain(): ProjectAir {
  const air = base();
  const env = EXECUTION_ENVELOPE_V1;
  const ecran = reachableScreens(air, env.triggers)[0];
  const action = controls(air, env).find((c) => c.executed)?.actionId;
  const entite = dataBindings(air).find((b) => b.seeded)?.entityId;
  if (ecran === undefined || action === undefined || entite === undefined) {
    throw new Error("corpus inattendu : impossible de construire un document sain");
  }
  return {
    ...air,
    expectedTests: [
      promesse(ecran, "test_ecran_vivant"),
      promesse(action, "test_action_vivante"),
      promesse(entite, "test_entite_vivante"),
    ],
  };
}

describe("gate des promesses — CONTRÔLE POSITIF", () => {
  it("un document dont toutes les cibles vivent PASSE", () => {
    const r = evaluatePromises(documentSain(), EXECUTION_ENVELOPE_V1);
    expect(r.failures).toEqual([]);
    expect(r.passed).toBe(true);
    expect(r.vivantes).toBe(3);
    expect(r.mortes).toBe(0);
  });

  it("le rapport publie TOUJOURS ce qu'il ne mesure pas", () => {
    // Sans cette clause, un lecteur prendrait « passed » pour « les promesses
    // sont tenues ». Elles ne le sont pas : seule leur cible a été vérifiée.
    const r = evaluatePromises(documentSain(), EXECUTION_ENVELOPE_V1);
    expect(r.limites.length).toBeGreaterThan(0);
    expect(r.limites[0]).toContain("ÉNONCÉ");
  });
});

describe("gate des promesses — CAS-TUEURS (elle doit ÉCHOUER)", () => {
  it("KT-1 · promesse sur un écran INATTEIGNABLE", () => {
    const air = base();
    const atteignables = new Set(reachableScreens(air, EXECUTION_ENVELOPE_V1.triggers));
    const orphelin = air.screens.find((s) => !atteignables.has(s.id));
    expect(orphelin, "le corpus doit contenir un écran inatteignable").toBeDefined();
    const r = evaluatePromises(
      { ...air, expectedTests: [promesse(orphelin?.id ?? "")] },
      EXECUTION_ENVELOPE_V1,
    );
    expect(r.passed).toBe(false);
    expect(r.mortes).toBe(1);
    expect(r.verdicts[0]?.motif).toContain("INATTEIGNABLE");
  });

  it("KT-2 · promesse sur un effet HORS ENVELOPPE", () => {
    const air = base();
    const horsEnveloppe = air.actions.find(
      (a) => !EXECUTION_ENVELOPE_V1.effects.includes(a.effect.kind),
    );
    expect(horsEnveloppe, "le corpus doit contenir un effet hors enveloppe").toBeDefined();
    const r = evaluatePromises(
      { ...air, expectedTests: [promesse(horsEnveloppe?.id ?? "")] },
      EXECUTION_ENVELOPE_V1,
    );
    expect(r.passed).toBe(false);
    expect(r.verdicts[0]?.state).toBe("cible_morte");
    expect(r.verdicts[0]?.motif).toContain("HORS ENVELOPPE");
  });

  it("KT-3 · promesse sur une entité SANS DONNÉE", () => {
    const air = base();
    const rendues = new Set(dataBindings(air).filter((b) => b.seeded).map((b) => b.entityId));
    const seche = air.entities.find((e) => !rendues.has(e.id));
    expect(seche, "le corpus doit contenir une entité non rendue").toBeDefined();
    const r = evaluatePromises(
      { ...air, expectedTests: [promesse(seche?.id ?? "")] },
      EXECUTION_ENVELOPE_V1,
    );
    expect(r.passed).toBe(false);
    expect(r.verdicts[0]?.state).toBe("cible_morte");
  });

  it("KT-4 · promesse sur une cible INEXISTANTE", () => {
    const r = evaluatePromises(
      { ...base(), expectedTests: [promesse("scr_ceci_nexiste_pas")] },
      EXECUTION_ENVELOPE_V1,
    );
    expect(r.passed).toBe(false);
    expect(r.inexistantes).toBe(1);
  });

  it("KT-5 · CONTOURNEMENT PAR LE SILENCE : ne rien promettre ne passe pas", () => {
    // Le contournement le plus évident d'une gate de promesses est de n'en
    // déclarer aucune. Sans cette règle, tout document muet serait certifié.
    const r = evaluatePromises({ ...base(), expectedTests: [] }, EXECUTION_ENVELOPE_V1);
    expect(r.passed).toBe(false);
    expect(r.failures[0]).toContain("AUCUNE promesse");
  });

  it("KT-6 · une seule promesse morte suffit à faire échouer un document sain", () => {
    // Vérifie qu'il n'y a AUCUNE compensation : la gate est conjonctive.
    const sain = documentSain();
    const air = base();
    const atteignables = new Set(reachableScreens(air, EXECUTION_ENVELOPE_V1.triggers));
    const orphelin = air.screens.find((s) => !atteignables.has(s.id));
    const r = evaluatePromises(
      { ...sain, expectedTests: [...sain.expectedTests, promesse(orphelin?.id ?? "", "test_poison")] },
      EXECUTION_ENVELOPE_V1,
    );
    expect(r.vivantes).toBe(3);
    expect(r.passed).toBe(false);
  });
});

describe("gate des promesses — MESURE SUR LE CORPUS GELÉ", () => {
  it("l'ampleur de l'écart est un CLIQUET, pas une opinion", () => {
    // Ces nombres ne sont pas des cibles : ce sont les MESURES de l'état du
    // 2026-08-31 (APP-D004). Ils doivent BAISSER quand le moteur gagne des
    // capacités — jamais monter en silence.
    const air = base();
    const r = evaluatePromises(air, EXECUTION_ENVELOPE_V1);
    expect(r.declared).toBe(18);
    expect(r.vivantes).toBe(4);
    expect(r.mortes).toBe(14);
    expect(r.passed).toBe(false);
  });

  it("la couverture est PUBLIÉE, jamais tue en silence", () => {
    const r = evaluatePromises(base(), EXECUTION_ENVELOPE_V1);
    for (const [couvert, total] of [r.coverage.screens, r.coverage.actions, r.coverage.entities]) {
      expect(total).toBeGreaterThan(0);
      expect(couvert).toBeLessThanOrEqual(total);
    }
  });
});
