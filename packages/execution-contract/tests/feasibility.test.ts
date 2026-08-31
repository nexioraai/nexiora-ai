import { describe, expect, it } from "vitest";
import {
  EXECUTION_ENVELOPE_V1,
  type ExecutionEnvelope,
} from "../src/envelope.ts";
import {
  FeasibilityRefusedError,
  analyzeFeasibility,
  assertFeasible,
} from "../src/feasibility.ts";
import { L, P, air, dataset, entity } from "./fixtures.ts";

/** Enveloppe FICTIVE d'un moteur complet — sert de contre-épreuve. */
const FULL: ExecutionEnvelope = {
  ...EXECUTION_ENVELOPE_V1,
  version: "test-full",
  effects: ["navigate", "capability", "mutation", "slot"],
  triggers: ["ui", "lifecycle", "data"],
  dataOperations: ["list", "get", "create", "update", "delete", "observe"],
  reachableBlockStates: {
    button: ["ready"],
    detail_header: ["ready"],
    empty_state: ["empty"],
    form: ["ready", "submitting", "error"],
    header: ["ready"],
    list: ["ready", "loading", "empty", "error"],
  },
  capabilitiesEmitCode: true,
  slotsInvoked: true,
  rulesEnforced: true,
  relationTraversal: true,
  listFiltering: true,
  rtlFlagEffective: true,
  themeNameEffective: true,
  crossScreenFormState: true,
};

const withMutation = () =>
  air({
    screens: [
      {
        id: "scr_a",
        title: L("A"),
        blocks: [
          { id: "blk_a_f", blockType: "form", entityId: "ent_x", props: P({ fieldIds: ["fld_x_f0"], submitLabel: "OK" }) },
        ],
      },
    ],
    entities: [entity("ent_x")],
    datasets: [dataset("data_x", "ent_x", 2)],
    actions: [
      {
        id: "act_save",
        name: "save",
        trigger: { kind: "ui", blockId: "blk_a_f" },
        effect: { kind: "mutation", entityId: "ent_x", operation: "create" },
      },
    ],
  });

// D-061 : `mutation` étant désormais EXÉCUTÉE, le contraste qui prouve que
// l'imputation discrimine se porte sur `capability` — seul effet restant inerte.
const withCapability = () =>
  air({
    screens: [
      {
        id: "scr_a",
        title: L("A"),
        blocks: [
          { id: "blk_a_f", blockType: "form", entityId: "ent_x", props: P({ fieldIds: ["fld_x_f0"], submitLabel: "OK" }) },
        ],
      },
    ],
    entities: [entity("ent_x")],
    datasets: [dataset("data_x", "ent_x", 2)],
    actions: [
      {
        id: "act_save",
        name: "save",
        trigger: { kind: "ui", blockId: "blk_a_f" },
        effect: { kind: "capability", capability: "camera", method: "open" },
      },
    ],
  });

describe("réconciliation — cas nominal", () => {
  it("un AIR entièrement dans l'enveloppe est RÉALISABLE, sans écart", () => {
    // Un document purement éditorial : aucun effet, aucune donnée, un thème
    // sans surcharge — mais `themeNameEffective` est vrai sur l'enveloppe
    // complète, donc aucun écart ne subsiste.
    const report = analyzeFeasibility(air(), FULL);
    expect(report.verdict).toBe("realizable");
    expect(report.gaps).toEqual([]);
  });

  // ÉDITION CONSCIENTE (2026-08-31, D-067) — ce test constatait le DERNIER écart
  // d'un document éditorial : `EXEC_THEME_NAME_INERT`, le thème déclaré sans
  // effet. Il a disparu : le nom du thème produit désormais une identité
  // visuelle. **Un document simple n'a plus AUCUN écart de faisabilité.**
  //
  // Le contraste « réalisable / dégradé » n'est pas perdu : il se démontre sur
  // `withCapability()`, seul effet restant sans exécution — test ci-dessous.
  it("un document éditorial n'a plus AUCUN écart de faisabilité (D-067)", () => {
    const report = analyzeFeasibility(air(), EXECUTION_ENVELOPE_V1);
    expect(report.gaps.map((g) => g.code)).toEqual([]);
    expect(report.verdict).toBe("realizable");
  });

  it("un document à effet `capability` reste DÉGRADÉ sous l'enveloppe réelle", () => {
    const report = analyzeFeasibility(withCapability(), EXECUTION_ENVELOPE_V1);
    expect(report.verdict).toBe("degraded");
    expect(report.gaps.some((g) => g.code === "EXEC_EFFECT_INERT")).toBe(true);
  });
});

describe("réconciliation — attribution des écarts", () => {
    // ÉDITION CONSCIENTE (2026-08-31, D-061) : `mutation` est désormais
  // EXÉCUTÉE. Le contraste qui prouve que l'imputation discrimine encore se
  // porte sur `capability`, seul effet restant sans exécution.
it("une capability non exécutée est imputée au MOTEUR, jamais au document", () => {
    const report = analyzeFeasibility(withCapability(), EXECUTION_ENVELOPE_V1);
    const gap = report.gaps.find((g) => g.code === "EXEC_EFFECT_INERT");
    expect(gap?.owner).toBe("moteur");
    expect(gap?.path).toBe("actions.act_save.effect");
  });

  it("un écran sans chemin est imputé au DOCUMENT", () => {
    const document = air({
      screens: [
        { id: "scr_a", title: L("A"), blocks: [{ id: "blk_a_h", blockType: "header", props: P({ title: "A" }) }] },
        { id: "scr_b", title: L("B"), blocks: [{ id: "blk_b_h", blockType: "header", props: P({ title: "B" }) }] },
      ],
      navigation: {
        entryScreenId: "scr_a",
        routes: [
          { id: "nav_a", screenId: "scr_a" },
          { id: "nav_b", screenId: "scr_b" },
        ],
      },
    });
    const report = analyzeFeasibility(document, FULL);
    const gap = report.gaps.find((g) => g.code === "EXEC_SCREEN_UNREACHABLE_DECLARED");
    expect(gap?.owner).toBe("document");
  });

  it("une référence rendue brute est imputée au CONTRAT", () => {
    const document = air({
      screens: [
        {
          id: "scr_a",
          title: L("A"),
          blocks: [{ id: "blk_a_l", blockType: "list", entityId: "ent_x", props: P({ titleFieldId: "fld_x_ref" }) }],
        },
      ],
      entities: [
        {
          id: "ent_x",
          name: "x",
          fields: [
            { id: "fld_x_f0", name: "f0", type: "string", required: true },
            { id: "fld_x_ref", name: "ref", type: "reference", required: false, referencesEntityId: "ent_y" },
          ],
        },
        entity("ent_y"),
      ],
      datasets: [dataset("data_x", "ent_x", 1), dataset("data_y", "ent_y", 1)],
    });
    const report = analyzeFeasibility(document, FULL);
    // Sous l'enveloppe COMPLÈTE la traversée existerait ; l'écart est donc
    // signalé par le module de graphe indépendamment de l'enveloppe, et
    // imputé au contrat — c'est le schéma qui ne sait pas l'exprimer.
    const gap = report.gaps.find((g) => g.code === "EXEC_REFERENCE_RENDERED_RAW");
    expect(gap?.owner).toBe("contrat");
  });

  it("les propriétaires restent DISTINGUÉS ; l'écart de contrat a disparu (D-066)", () => {
    // ÉDITION CONSCIENTE (2026-08-31, D-066) : la cause « contrat » de ce
    // document a DISPARU — l'état d'un formulaire survit désormais au changement
    // d'écran. Il ne reste donc que deux propriétaires ici. La distinction
    // elle-même n'est pas perdue : `EXEC_REFERENCE_RENDERED_RAW` reste imputé au
    // contrat, et le test juste au-dessus le vérifie.
    // Causes portées par ce document :
    //  · document — `scr_z` n'est ciblé par aucune action ;
    //  · moteur   — l'effet `capability` est hors enveloppe.
    const document = air({
      screens: [
        {
          id: "scr_a",
          title: L("A"),
          blocks: [
            { id: "blk_a_f", blockType: "form", entityId: "ent_x", props: P({ fieldIds: ["fld_x_f0"], submitLabel: "OK" }) },
          ],
        },
        {
          id: "scr_b",
          title: L("B"),
          blocks: [
            { id: "blk_b_f", blockType: "form", entityId: "ent_x", props: P({ fieldIds: ["fld_x_f0"], submitLabel: "OK" }) },
          ],
        },
        { id: "scr_z", title: L("Z"), blocks: [{ id: "blk_z_h", blockType: "header", props: P({ title: "Z" }) }] },
      ],
      navigation: {
        entryScreenId: "scr_a",
        routes: [
          { id: "nav_a", screenId: "scr_a" },
          { id: "nav_b", screenId: "scr_b" },
          { id: "nav_z", screenId: "scr_z" },
        ],
      },
      entities: [entity("ent_x")],
      datasets: [dataset("data_x", "ent_x", 2)],
      actions: [
        {
          id: "act_go",
          name: "go",
          trigger: { kind: "ui", blockId: "blk_a_f" },
          effect: { kind: "navigate", screenId: "scr_b" },
        },
        {
          id: "act_save",
          name: "save",
          trigger: { kind: "ui", blockId: "blk_b_f" },
          effect: { kind: "mutation", entityId: "ent_x", operation: "create" },
        },
      ],
    });
    const report = analyzeFeasibility(document, EXECUTION_ENVELOPE_V1);
    expect([...new Set(report.gaps.map((g) => g.owner))].sort()).toEqual([
      "document",
      "moteur",
    ]);
    expect(report.gaps.find((g) => g.owner === "document")?.code).toBe(
      "EXEC_SCREEN_UNREACHABLE_DECLARED",
    );
    // L'écart `EXEC_CROSS_SCREEN_FORM_STATE` a DISPARU (D-066) : l'état survit
    // désormais au changement d'écran. On vérifie son ABSENCE plutôt que de
    // retirer la ligne — sans quoi une régression le ferait revenir en silence.
    expect(report.gaps.some((g) => g.code === "EXEC_CROSS_SCREEN_FORM_STATE")).toBe(false);
  });
});

describe("réconciliation — contrôles fantômes", () => {
    // ÉDITION CONSCIENTE (2026-08-31, D-061) : `mutation` est désormais
  // EXÉCUTÉE. Le contraste qui prouve que l'imputation discrimine encore se
  // porte sur `capability`, seul effet restant sans exécution.
it("compte un contrôle fantôme pour un formulaire à effet capability", () => {
    const report = analyzeFeasibility(withCapability(), EXECUTION_ENVELOPE_V1);
    expect(report.metrics.controlsVisible).toBe(1);
    expect(report.metrics.ghostControls).toBe(1);
    expect(report.gaps.some((g) => g.code === "EXEC_GHOST_CONTROL")).toBe(true);
  });

  it("zéro fantôme sous une enveloppe complète", () => {
    const report = analyzeFeasibility(withMutation(), FULL);
    expect(report.metrics.ghostControls).toBe(0);
  });
});

describe("déterminisme", () => {
  it("même document ⇒ même rapport, empreinte comprise", () => {
    const a = analyzeFeasibility(withMutation(), EXECUTION_ENVELOPE_V1);
    const b = analyzeFeasibility(withMutation(), EXECUTION_ENVELOPE_V1);
    expect(a.reportHash).toBe(b.reportHash);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("les écarts sont triés par (path, code)", () => {
    const report = analyzeFeasibility(withMutation(), EXECUTION_ENVELOPE_V1);
    const keys = report.gaps.map((g) => `${g.path}|${g.code}`);
    expect(keys).toEqual([...keys].sort());
  });

  it("l'empreinte change si un écart change", () => {
    const a = analyzeFeasibility(withMutation(), EXECUTION_ENVELOPE_V1);
    const b = analyzeFeasibility(withMutation(), FULL);
    expect(a.reportHash).not.toBe(b.reportHash);
  });
});

describe("modes fail-closed", () => {
  it("`strict` REFUSE tout document porteur d'un écart", () => {
    expect(() => assertFeasible(withMutation(), EXECUTION_ENVELOPE_V1, "strict")).toThrow(
      FeasibilityRefusedError,
    );
  });

  it("le refus TRANSPORTE le rapport — un refus sans diagnostic serait une régression", () => {
    try {
      assertFeasible(withMutation(), EXECUTION_ENVELOPE_V1, "strict");
      expect.unreachable("le refus doit être levé");
    } catch (error) {
      expect(error).toBeInstanceOf(FeasibilityRefusedError);
      const { report } = error as FeasibilityRefusedError;
      expect(report.gaps.length).toBeGreaterThan(0);
      expect(report.verdict).toBe("refused");
    }
  });

  it("`declared_degraded` laisse passer MAIS scelle l'écart", () => {
    const report = assertFeasible(withMutation(), EXECUTION_ENVELOPE_V1, "declared_degraded");
    expect(report.verdict).toBe("degraded");
    expect(report.reportHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("`strict` accepte un document entièrement réalisable", () => {
    expect(() => assertFeasible(air(), FULL, "strict")).not.toThrow();
  });
});

describe("états de blocs", () => {
  it("signale les états déclarés au registre mais inatteignables", () => {
    const report = analyzeFeasibility(withMutation(), EXECUTION_ENVELOPE_V1);
    const gap = report.gaps.find((g) => g.code === "EXEC_BLOCK_STATE_UNREACHABLE");
    // ÉDITION CONSCIENTE (2026-08-31, D-060) : `error` a CESSÉ d'être
    // inatteignable — comme `loading` et `empty`. Le seul état du registre
    // encore hors de portée sur `form` est `submitting`, qui suppose une
    // ÉCRITURE : il tombera avec la VOIE 3 (mutation), pas avant. L'écart se
    // rétrécit, il ne disparaît pas — et le test le dit précisément.
    expect(gap?.detail).toContain("submitting");
    expect(gap?.detail).not.toContain("error");
    expect(gap?.detail).toContain("submitting");
    // MESURE MISE À JOUR (D-060) : sur les 3 états que le registre déclare pour
    // ce bloc, 4 sont désormais ATTEINTS (contre 1) — `submitting` reste seul
    // hors de portée, faute d'écriture.
    expect(report.metrics.blockStatesDeclared).toBe(3);
    expect(report.metrics.blockStatesReachable).toBe(4);
  });
});
