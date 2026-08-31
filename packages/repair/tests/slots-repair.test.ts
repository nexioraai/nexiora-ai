// SECOND CHEMIN DE RÉPARATION : les CODE SLOTS (Phase 9).
//
// §10 autorise deux surfaces de réparation, l'AIR et les slots. Le premier
// chemin est prouvé dans loop.test.ts ; celui-ci prouve le second, avec du
// code de slot réaliste et les mêmes gardes.
//
// Fait mesuré sur le corpus gelé (2026-08-29) : les 12 documents déclarent
// 44 slots et 43 actions à effet `slot`, et AUCUNE implémentation n'a jamais
// été produite par le moteur. La panne réparée ici n'est donc pas une
// fiction de test : c'est l'état réel du générateur avant cette phase
// (consigné en dette DET-018).
import { describe, expect, it } from "vitest";
import { canonicalJson } from "@deribfy/air-schema";
import { runRepairLoop } from "../src/loop.ts";
import { diagnose } from "../src/diagnose.ts";
import type { RepairAuthor, RepairState } from "../src/contracts.ts";
import { SLOTS_RESTO } from "./fixtures/slots-resto.ts";
import { clone, loadAir, oracleVerifier, simulator } from "./harness.ts";

const AIR = loadAir("resto-quartier.air.json");
const etatSansSlots: RepairState = { air: AIR, slots: [] };

// Panne CONSTATÉE au comportement : le panier n'affiche aucun total, parce
// qu'aucun code ne calcule ce total. L'Oracle L1 ne peut pas voir cela (il
// vérifie la structure) — c'est un signal E2E, et la boucle sait le traiter.
const signalE2E = {
  source: "e2e" as const,
  checks: [
    { name: "flow_panier", passed: false, detail: "total du panier absent à l'écran scr_panier" },
  ],
};

const auteurDeSlots = (livrer: readonly (typeof SLOTS_RESTO)[number][]): RepairAuthor => ({
  id: "auteur-slots",
  propose({ state }) {
    return {
      authorId: "auteur-slots",
      next: { air: state.air, slots: livrer },
      edits: livrer.map((s) => ({ path: `slots/${s.slotId}.ts`, content: s.source })),
      tokens: 850,
      rationale: `${String(livrer.length)} implémentation(s) de slot proposée(s)`,
    };
  },
});

describe("réparation par les Code Slots", () => {
  it("DIAGNOSE : les slots référencés sans implémentation sont nommés", () => {
    const d = diagnose(signalE2E, etatSansSlots);
    expect(d.repairClass).toBe("SLOT_IMPLEMENTATION_MISSING");
    expect(d.targets.map((t) => t.slotId)).toEqual([
      "slot_calcul_total_panier",
      "slot_estimer_heure_retrait",
      "slot_format_prix_fcfa",
      "slot_generer_reference_commande",
      "slot_libelle_statut_commande",
    ]);
    expect(d.evidence.some((e) => e.includes("sans implémentation"))).toBe(true);
  });

  it("réparation COMPLÈTE : 5 slots livrés, gate franchi, Oracle vert", () => {
    const outcome = runRepairLoop({
      signal: signalE2E,
      state: etatSansSlots,
      reference: etatSansSlots,
      budget: { maxAttempts: 2, maxTokens: 5_000 },
      author: auteurDeSlots(SLOTS_RESTO),
      verifier: oracleVerifier,
      simulator,
    });
    expect(outcome.status).toBe("repaired");
    expect(outcome.state?.slots).toHaveLength(5);
    // L'AIR n'a pas bougé d'un octet : la réparation est 100 % côté slots.
    expect(canonicalJson(outcome.state?.air)).toBe(canonicalJson(AIR));
    // L'artefact gagne exactement 6 fichiers : 5 modules + le registre.
    expect(outcome.impact?.added).toEqual([
      "slots/index.ts",
      "slots/slot_calcul_total_panier.ts",
      "slots/slot_estimer_heure_retrait.ts",
      "slots/slot_format_prix_fcfa.ts",
      "slots/slot_generer_reference_commande.ts",
      "slots/slot_libelle_statut_commande.ts",
    ]);
    expect(outcome.impact?.removed).toEqual([]);
    expect(outcome.impact?.rootHashBefore).not.toBe(outcome.impact?.rootHashAfter);
  });

  it("réparation PARTIELLE : refusée — la cause diagnostiquée subsiste", () => {
    // 3 slots sur 5 : aucun contrôle de l'Oracle ne s'en plaint (la
    // structure reste valide). Sans le contrôle de disparition de la cause,
    // la boucle déclarerait « réparé » à tort. Elle refuse.
    const outcome = runRepairLoop({
      signal: signalE2E,
      state: etatSansSlots,
      reference: etatSansSlots,
      budget: { maxAttempts: 1, maxTokens: 5_000 },
      author: auteurDeSlots(SLOTS_RESTO.slice(0, 3)),
      verifier: oracleVerifier,
      simulator,
    });
    expect(outcome.status).not.toBe("repaired");
    expect(
      outcome.journal
        .filter((e) => e.stage === "verify")
        .some((e) => e.detail.includes("cause diagnostiquée toujours présente")),
    ).toBe(true);
  });

  it("un slot NON DÉCLARÉ par l'AIR est refusé avant toute adoption", () => {
    const auteur: RepairAuthor = {
      id: "auteur-inventif",
      propose({ state }) {
        return {
          authorId: "auteur-inventif",
          next: {
            air: state.air,
            slots: [
              ...SLOTS_RESTO,
              {
                slotId: "slot_analytics_maison",
                source: "export function runSlot(e: { x: number }): { y: number } {\n  return { y: e.x };\n}\n",
                authorId: "auteur-inventif",
              },
            ],
          },
          edits: [{ path: "slots/slot_analytics_maison.ts", content: "" }],
          tokens: 400,
          rationale: "ajoute un slot non prévu par l'AIR",
        };
      },
    };
    const outcome = runRepairLoop({
      signal: signalE2E,
      state: etatSansSlots,
      reference: etatSansSlots,
      budget: { maxAttempts: 1, maxTokens: 5_000 },
      author: auteur,
      verifier: oracleVerifier,
      simulator,
    });
    expect(outcome.status).not.toBe("repaired");
    // La simulation refuse en amont (le compilateur est fail-closed) : le
    // slot inventé n'atteint jamais l'artefact.
    expect(
      outcome.journal.some(
        (e) => !e.ok && (e.detail.includes("EMIT_SLOT_UNDECLARED") || e.detail.includes("SLOT_UNDECLARED")),
      ),
    ).toBe(true);
  });

  it("le code de slot livré est REPRIS TEL QUEL dans l'artefact", () => {
    const outcome = runRepairLoop({
      signal: signalE2E,
      state: etatSansSlots,
      reference: etatSansSlots,
      budget: { maxAttempts: 1, maxTokens: 5_000 },
      author: auteurDeSlots(SLOTS_RESTO),
      verifier: oracleVerifier,
      simulator,
    });
    const livre = outcome.state?.slots.find((s) => s.slotId === "slot_libelle_statut_commande");
    expect(livre?.source).toBe(
      SLOTS_RESTO.find((s) => s.slotId === "slot_libelle_statut_commande")?.source,
    );
  });

  it("le corpus gelé n'a pas été modifié par ces scénarios", () => {
    expect(canonicalJson(AIR)).toBe(canonicalJson(loadAir("resto-quartier.air.json")));
    expect(canonicalJson(clone(AIR))).toBe(canonicalJson(AIR));
  });
});
