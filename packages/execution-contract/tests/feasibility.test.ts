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

describe("réconciliation — cas nominal", () => {
  it("un AIR entièrement dans l'enveloppe est RÉALISABLE, sans écart", () => {
    // Un document purement éditorial : aucun effet, aucune donnée, un thème
    // sans surcharge — mais `themeNameEffective` est vrai sur l'enveloppe
    // complète, donc aucun écart ne subsiste.
    const report = analyzeFeasibility(air(), FULL);
    expect(report.verdict).toBe("realizable");
    expect(report.gaps).toEqual([]);
  });

  it("le MÊME document est DÉGRADÉ sous l'enveloppe réelle du moteur", () => {
    const report = analyzeFeasibility(air(), EXECUTION_ENVELOPE_V1);
    expect(report.verdict).toBe("degraded");
    // Seul écart d'un document éditorial : le thème déclaré est inerte.
    expect(report.gaps.map((g) => g.code)).toEqual(["EXEC_THEME_NAME_INERT"]);
  });
});

describe("réconciliation — attribution des écarts", () => {
  it("une mutation non exécutée est imputée au MOTEUR, jamais au document", () => {
    const report = analyzeFeasibility(withMutation(), EXECUTION_ENVELOPE_V1);
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

  it("les TROIS propriétaires coexistent et restent distingués", () => {
    // Document construit pour porter EXACTEMENT une cause de chaque nature :
    //  · document — `scr_z` n'est ciblé par aucune action ;
    //  · moteur   — l'effet `mutation` est hors enveloppe ;
    //  · contrat  — deux écrans portent un formulaire, l'état ne survit pas.
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
      "contrat",
      "document",
      "moteur",
    ]);
    expect(report.gaps.find((g) => g.owner === "document")?.code).toBe(
      "EXEC_SCREEN_UNREACHABLE_DECLARED",
    );
    expect(report.gaps.find((g) => g.owner === "contrat")?.code).toBe(
      "EXEC_CROSS_SCREEN_FORM_STATE",
    );
  });
});

describe("réconciliation — contrôles fantômes", () => {
  it("compte un contrôle fantôme pour un formulaire à effet mutation", () => {
    const report = analyzeFeasibility(withMutation(), EXECUTION_ENVELOPE_V1);
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
    expect(gap?.detail).toContain("error");
    expect(gap?.detail).toContain("submitting");
    expect(report.metrics.blockStatesDeclared).toBe(3);
    expect(report.metrics.blockStatesReachable).toBe(1);
  });
});
