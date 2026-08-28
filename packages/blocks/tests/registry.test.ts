import { describe, expect, it } from "vitest";
import { getBlock, listBlockIds, validateAirBlocks } from "../src";
import type { AirBlockSlice } from "../src";

// PONT validateAirBlocks — allowlist positive, liaisons d'entité, schémas
// stricts de props, références de champs et d'actions. NON câblé au golden
// corpus (L2 : corpus GELÉ — le pont est la porte du compilateur, Phase 4).
const base: AirBlockSlice = {
  screens: [],
  entities: [
    { id: "ent_article", fields: [{ id: "fld_titre" }, { id: "fld_prix" }] },
  ],
  actions: [{ id: "act_scanner" }],
};

const screen = (
  blocks: AirBlockSlice["screens"][number]["blocks"],
): AirBlockSlice => ({ ...base, screens: [{ id: "scr_accueil", blocks }] });

describe("pont AIR ↔ registre de blocs", () => {
  it("API du registre : référence connue / inconnue", () => {
    expect(listBlockIds()).toHaveLength(6);
    expect(getBlock("list")?.entity).toBe("required");
    expect(getBlock("carousel")).toBeUndefined();
  });

  it("REFUS NET — blockType hors allowlist", () => {
    const diags = validateAirBlocks(
      screen([{ id: "blk_1", blockType: "carousel" }]),
    );
    expect(diags).toEqual([
      expect.objectContaining({ code: "BLOCK_UNKNOWN", path: "screens[0].blocks[0]" }),
    ]);
  });

  it("liaison d'entité : exigée (list) et interdite (header)", () => {
    const diags = validateAirBlocks(
      screen([
        {
          id: "blk_1",
          blockType: "list",
          props: [{ key: "titleFieldId", value: "fld_titre" }],
        },
        {
          id: "blk_2",
          blockType: "header",
          entityId: "ent_article",
          props: [{ key: "title", value: "Accueil" }],
        },
      ]),
    );
    expect(diags.map((d) => d.code)).toEqual([
      "BLOCK_ENTITY_REQUIRED",
      "BLOCK_ENTITY_FORBIDDEN",
    ]);
  });

  it("entité inconnue → diagnostic dédié", () => {
    const diags = validateAirBlocks(
      screen([
        {
          id: "blk_1",
          blockType: "list",
          entityId: "ent_fantome",
          props: [{ key: "titleFieldId", value: "fld_titre" }],
        },
      ]),
    );
    expect(diags.map((d) => d.code)).toContain("BLOCK_ENTITY_UNKNOWN");
  });

  it("schéma STRICT — clé inconnue et valeur invalide refusées", () => {
    const diags = validateAirBlocks(
      screen([
        {
          id: "blk_1",
          blockType: "header",
          props: [
            { key: "title", value: "Accueil" },
            { key: "couleur", value: "#FF0000" },
          ],
        },
      ]),
    );
    expect(diags.map((d) => d.code)).toEqual(["BLOCK_PROPS_INVALID"]);
    expect(diags[0]?.message).toContain("couleur");
  });

  it("référence de champ inexistante sur l'entité liée → refus", () => {
    const diags = validateAirBlocks(
      screen([
        {
          id: "blk_1",
          blockType: "list",
          entityId: "ent_article",
          props: [{ key: "titleFieldId", value: "fld_inconnu" }],
        },
      ]),
    );
    expect(diags).toEqual([
      expect.objectContaining({
        code: "BLOCK_FIELD_UNKNOWN",
        path: "screens[0].blocks[0].props.titleFieldId",
      }),
    ]);
  });

  it("référence d'action inexistante → refus ; existante → accepté", () => {
    const bad = validateAirBlocks(
      screen([
        {
          id: "blk_1",
          blockType: "button",
          props: [
            { key: "label", value: "Scanner" },
            { key: "actionId", value: "act_fantome" },
          ],
        },
      ]),
    );
    expect(bad.map((d) => d.code)).toEqual(["BLOCK_ACTION_UNKNOWN"]);

    const ok = validateAirBlocks(
      screen([
        {
          id: "blk_1",
          blockType: "button",
          props: [
            { key: "label", value: "Scanner" },
            { key: "actionId", value: "act_scanner" },
          ],
        },
      ]),
    );
    expect(ok).toEqual([]);
  });

  it("écran complet VALIDE (les 6 blocs bien formés) → zéro diagnostic", () => {
    const diags = validateAirBlocks(
      screen([
        { id: "blk_1", blockType: "header", props: [{ key: "title", value: "Accueil" }] },
        {
          id: "blk_2",
          blockType: "list",
          entityId: "ent_article",
          props: [
            { key: "titleFieldId", value: "fld_titre" },
            { key: "trailingFieldId", value: "fld_prix" },
          ],
        },
        {
          id: "blk_3",
          blockType: "detail_header",
          entityId: "ent_article",
          props: [
            { key: "titleFieldId", value: "fld_titre" },
            { key: "badgeFieldIds", value: ["fld_prix"] },
          ],
        },
        {
          id: "blk_4",
          blockType: "form",
          entityId: "ent_article",
          props: [
            { key: "fieldIds", value: ["fld_titre"] },
            { key: "submitLabel", value: "Enregistrer" },
          ],
        },
        {
          id: "blk_5",
          blockType: "button",
          props: [
            { key: "label", value: "Voir" },
            { key: "actionId", value: "act_scanner" },
          ],
        },
        {
          id: "blk_6",
          blockType: "empty_state",
          props: [{ key: "title", value: "Aucun résultat" }],
        },
      ]),
    );
    expect(diags).toEqual([]);
  });

  it("F1 — button SANS actionId → refus (un CTA non câblable est interdit)", () => {
    const diags = validateAirBlocks(
      screen([
        { id: "blk_1", blockType: "button", props: [{ key: "label", value: "Voir" }] },
      ]),
    );
    expect(diags.map((d) => d.code)).toEqual(["BLOCK_PROPS_INVALID"]);
    expect(diags[0]?.path).toContain("actionId");
  });

  it("F2 — empty_state : actionLabel SANS actionId → refus (jamais de libellé ignoré)", () => {
    const diags = validateAirBlocks(
      screen([
        {
          id: "blk_1",
          blockType: "empty_state",
          props: [
            { key: "title", value: "Aucun résultat" },
            { key: "actionLabel", value: "Réinitialiser" },
          ],
        },
      ]),
    );
    expect(diags.map((d) => d.code)).toEqual(["BLOCK_PROPS_INVALID"]);
    expect(diags[0]?.path).toContain("actionId");
  });

  it("F2 — empty_state : actionId SANS actionLabel → refus (action non rendable)", () => {
    const diags = validateAirBlocks(
      screen([
        {
          id: "blk_1",
          blockType: "empty_state",
          props: [
            { key: "title", value: "Aucun résultat" },
            { key: "actionId", value: "act_scanner" },
          ],
        },
      ]),
    );
    expect(diags.map((d) => d.code)).toEqual(["BLOCK_PROPS_INVALID"]);
    expect(diags[0]?.path).toContain("actionLabel");
  });

  it("F2 — empty_state : paire complète et action EXISTANTE → accepté ; action fantôme → refus", () => {
    const paire = (actionId: string): AirBlockSlice =>
      screen([
        {
          id: "blk_1",
          blockType: "empty_state",
          props: [
            { key: "title", value: "Aucun résultat" },
            { key: "actionLabel", value: "Réinitialiser" },
            { key: "actionId", value: actionId },
          ],
        },
      ]);
    expect(validateAirBlocks(paire("act_scanner"))).toEqual([]);
    expect(validateAirBlocks(paire("act_fantome")).map((d) => d.code)).toEqual([
      "BLOCK_ACTION_UNKNOWN",
    ]);
  });

  it("déterminisme — deux exécutions produisent les mêmes diagnostics dans le même ordre", () => {
    const doc = screen([
      { id: "blk_1", blockType: "carousel" },
      { id: "blk_2", blockType: "list" },
    ]);
    expect(validateAirBlocks(doc)).toEqual(validateAirBlocks(doc));
  });
});
