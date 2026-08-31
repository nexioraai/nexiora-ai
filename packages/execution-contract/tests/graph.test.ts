import { describe, expect, it } from "vitest";
import {
  controls,
  dataBindings,
  detailScreens,
  rawReferences,
  reachableScreens,
} from "../src/graph.ts";
import { EXECUTION_ENVELOPE_V1 } from "../src/envelope.ts";
import { L, P, air, dataset, entity } from "./fixtures.ts";

const ALL = ["ui", "lifecycle", "data"] as const;

describe("atteignabilité", () => {
  it("l'écran d'entrée est toujours atteignable", () => {
    expect(reachableScreens(air(), ALL)).toEqual(["scr_a"]);
  });

  it("un écran ciblé par une action `ui` depuis un écran atteignable le devient", () => {
    const document = air({
      screens: [
        {
          id: "scr_a",
          title: L("A"),
          blocks: [
            { id: "blk_a_b", blockType: "button", props: P({ label: "→", actionId: "act_go" }) },
          ],
        },
        { id: "scr_b", title: L("B"), blocks: [{ id: "blk_b_h", blockType: "header", props: P({ title: "B" }) }] },
      ],
      navigation: {
        entryScreenId: "scr_a",
        routes: [
          { id: "nav_a", screenId: "scr_a" },
          { id: "nav_b", screenId: "scr_b" },
        ],
      },
      actions: [
        {
          id: "act_go",
          name: "go",
          trigger: { kind: "ui", blockId: "blk_a_b" },
          effect: { kind: "navigate", screenId: "scr_b" },
        },
      ],
    });
    expect(reachableScreens(document, ALL)).toEqual(["scr_a", "scr_b"]);
  });

  it("un chemin PARTANT d'un écran mort reste mort (fermeture transitive)", () => {
    // scr_b n'est ciblé par personne ; l'action qui mène de scr_b à scr_c ne
    // peut donc jamais être déclenchée. Une mesure naïve (« une action cible
    // scr_c ») déclarerait scr_c atteignable — elle serait fausse.
    const document = air({
      screens: [
        { id: "scr_a", title: L("A"), blocks: [{ id: "blk_a_h", blockType: "header", props: P({ title: "A" }) }] },
        {
          id: "scr_b",
          title: L("B"),
          blocks: [{ id: "blk_b_b", blockType: "button", props: P({ label: "→", actionId: "act_bc" }) }],
        },
        { id: "scr_c", title: L("C"), blocks: [{ id: "blk_c_h", blockType: "header", props: P({ title: "C" }) }] },
      ],
      navigation: {
        entryScreenId: "scr_a",
        routes: [
          { id: "nav_a", screenId: "scr_a" },
          { id: "nav_b", screenId: "scr_b" },
          { id: "nav_c", screenId: "scr_c" },
        ],
      },
      actions: [
        {
          id: "act_bc",
          name: "bc",
          trigger: { kind: "ui", blockId: "blk_b_b" },
          effect: { kind: "navigate", screenId: "scr_c" },
        },
      ],
    });
    expect(reachableScreens(document, ALL)).toEqual(["scr_a"]);
  });

  it("l'enveloppe borne l'atteignabilité : un chemin `lifecycle` ne compte pas", () => {
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
      actions: [
        {
          id: "act_auto",
          name: "auto",
          trigger: { kind: "lifecycle", event: "screen_open", screenId: "scr_a" },
          effect: { kind: "navigate", screenId: "scr_b" },
        },
      ],
    });
    expect(reachableScreens(document, ALL)).toEqual(["scr_a", "scr_b"]);
    expect(reachableScreens(document, EXECUTION_ENVELOPE_V1.triggers)).toEqual(["scr_a"]);
  });
});

describe("écrans de détail", () => {
  const withDetail = (fromList: boolean) =>
    air({
      screens: [
        {
          id: "scr_a",
          title: L("A"),
          blocks: [
            { id: "blk_a_l", blockType: "list", entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) },
            { id: "blk_a_b", blockType: "button", props: P({ label: "→", actionId: "act_go" }) },
          ],
        },
        {
          id: "scr_d",
          title: L("D"),
          blocks: [
            { id: "blk_d_dh", blockType: "detail_header", entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) },
          ],
        },
      ],
      navigation: {
        entryScreenId: "scr_a",
        routes: [
          { id: "nav_a", screenId: "scr_a" },
          { id: "nav_d", screenId: "scr_d" },
        ],
      },
      entities: [entity("ent_x")],
      actions: [
        {
          id: "act_go",
          name: "go",
          trigger: { kind: "ui", blockId: fromList ? "blk_a_l" : "blk_a_b" },
          effect: { kind: "navigate", screenId: "scr_d" },
        },
      ],
    });

  it("détecte une source d'itemId quand le déclencheur est un bloc `list`", () => {
    expect(detailScreens(withDetail(true))[0]?.hasItemIdSource).toBe(true);
  });

  it("détecte l'ABSENCE de source quand le déclencheur est un bouton", () => {
    // Cas silencieux le plus dangereux : l'écran s'ouvre, mais le provider
    // retombe sur la PREMIÈRE ligne — l'utilisateur voit toujours la même.
    expect(detailScreens(withDetail(false))[0]?.hasItemIdSource).toBe(false);
  });
});

describe("liaisons de données", () => {
  it("distingue une entité semée d'une entité vide", () => {
    const document = air({
      screens: [
        {
          id: "scr_a",
          title: L("A"),
          blocks: [
            { id: "blk_a_l", blockType: "list", entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) },
            { id: "blk_a_m", blockType: "list", entityId: "ent_y", props: P({ titleFieldId: "fld_y_f0" }) },
          ],
        },
      ],
      entities: [entity("ent_x"), entity("ent_y")],
      datasets: [dataset("data_x", "ent_x", 3)],
    });
    const found = dataBindings(document);
    expect(found.find((b) => b.entityId === "ent_x")?.seeded).toBe(true);
    expect(found.find((b) => b.entityId === "ent_y")?.seeded).toBe(false);
  });

  it("additionne plusieurs datasets d'une même entité", () => {
    const document = air({
      screens: [
        {
          id: "scr_a",
          title: L("A"),
          blocks: [{ id: "blk_a_l", blockType: "list", entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) }],
        },
      ],
      entities: [entity("ent_x")],
      datasets: [dataset("data_1", "ent_x", 3), dataset("data_2", "ent_x", 4)],
    });
    expect(dataBindings(document)[0]?.rowCount).toBe(7);
  });
});

describe("contrôles fantômes", () => {
    // ÉDITION CONSCIENTE (2026-08-31, D-061) : un bouton `mutation` n'est PLUS
  // fantôme — le dispatcher présente l'écriture au fournisseur. Le contraste
  // qui prouve que la mesure discrimine encore se porte sur `capability`, seul
  // effet encore sans exécution.
it("un bouton `navigate` est exécuté ; un bouton `capability` est fantôme", () => {
    const document = air({
      screens: [
        {
          id: "scr_a",
          title: L("A"),
          blocks: [
            { id: "blk_a_ok", blockType: "button", props: P({ label: "ok", actionId: "act_nav" }) },
            { id: "blk_a_ko", blockType: "button", props: P({ label: "ko", actionId: "act_mut" }) },
          ],
        },
      ],
      entities: [entity("ent_x")],
      actions: [
        {
          id: "act_nav",
          name: "nav",
          trigger: { kind: "ui", blockId: "blk_a_ok" },
          effect: { kind: "navigate", screenId: "scr_a" },
        },
        {
          id: "act_mut",
          name: "mut",
          trigger: { kind: "ui", blockId: "blk_a_ko" },
          effect: { kind: "capability", capability: "camera", method: "open" },
        },
      ],
    });
    const found = controls(document, EXECUTION_ENVELOPE_V1);
    expect(found.find((c) => c.blockId === "blk_a_ok")?.executed).toBe(true);
    expect(found.find((c) => c.blockId === "blk_a_ko")?.executed).toBe(false);
  });

  it("un bloc `header` n'est jamais un contrôle (il ne promet rien)", () => {
    expect(controls(air(), EXECUTION_ENVELOPE_V1)).toEqual([]);
  });
});

describe("références rendues brutes", () => {
  it("détecte un champ `reference` utilisé comme titre de liste", () => {
    const document = air({
      screens: [
        {
          id: "scr_a",
          title: L("A"),
          blocks: [
            { id: "blk_a_l", blockType: "list", entityId: "ent_x", props: P({ titleFieldId: "fld_x_ref" }) },
          ],
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
    });
    const found = rawReferences(document);
    expect(found).toHaveLength(1);
    expect(found[0]?.propKey).toBe("titleFieldId");
    expect(found[0]?.targetEntityId).toBe("ent_y");
  });

  it("un champ non-reference n'est jamais signalé", () => {
    const document = air({
      screens: [
        {
          id: "scr_a",
          title: L("A"),
          blocks: [{ id: "blk_a_l", blockType: "list", entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) }],
        },
      ],
      entities: [entity("ent_x")],
    });
    expect(rawReferences(document)).toEqual([]);
  });
});
