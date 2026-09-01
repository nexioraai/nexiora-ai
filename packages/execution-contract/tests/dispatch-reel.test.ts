// D-105 — `executed` EXIGE UN DISPATCH RÉEL.
//
// CAUSE RACINE, mesurée sur les 24 documents : `controls()` calculait
// `executed` à partir de la seule enveloppe. Or `button` et `empty_state`
// dispatchent par leur prop `actionId` — le déclencheur y est DÉCORATIF.
// 17 actions dont le déclencheur visait un bloc dispatchant AUTRE CHOSE
// étaient donc déclarées exécutées alors que le runtime ne les appelle jamais.
// Faux vert contaminant F1 : une promesse visant l'une d'elles était jugée vivante.
//
// LA CORRECTION EST ICI, PAS AU VALIDATEUR. Refuser ces documents aurait
// invalidé le corpus GELÉ — qui en porte 3 et sert de base de comparaison à
// toutes les mesures historiques. L'oracle doit dire la vérité ; les gates en
// tirent les conséquences.
import { describe, expect, it } from "vitest";
import { controls } from "../src/graph.ts";
import { EXECUTION_ENVELOPE_V1 } from "../src/envelope.ts";
import { L, P, air } from "./fixtures.ts";

/** Un écran, un bloc, une action `ui` : la prop et le déclencheur peuvent diverger. */
const doc = (blockType: string, propActionId: string | undefined, entityId?: string) =>
  air({
    screens: [
      {
        id: "scr_a",
        title: L("A"),
        blocks: [
          {
            id: "blk_c",
            blockType,
            ...(entityId === undefined ? {} : { entityId }),
            props: P({
              label: "L",
              title: "T",
              ...(propActionId === undefined ? {} : { actionId: propActionId, actionLabel: "A" }),
            }),
          },
        ],
      },
    ],
    navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] },
    actions: [
      {
        id: "act_declaree",
        name: "Déclarée",
        trigger: { kind: "ui", blockId: "blk_c" },
        effect: { kind: "navigate", screenId: "scr_a" },
      },
      {
        id: "act_autre",
        name: "Autre",
        trigger: { kind: "ui", blockId: "blk_ailleurs" },
        effect: { kind: "navigate", screenId: "scr_a" },
      },
    ],
  });

const executee = (d: ReturnType<typeof doc>, actionId: string) =>
  controls(d, EXECUTION_ENVELOPE_V1).find((c) => c.actionId === actionId)?.executed;

describe("`executed` exige un dispatch réel (D-105)", () => {
  it("🔴 LE DÉFAUT MESURÉ : la prop dispatche une AUTRE action", () => {
    for (const parProp of ["button", "empty_state"]) {
      expect(executee(doc(parProp, "act_autre"), "act_declaree"), parProp).toBe(false);
    }
  });

  it("🔴 la prop est ABSENTE : rien n'est dispatché", () => {
    for (const parProp of ["button", "empty_state"]) {
      expect(executee(doc(parProp, undefined), "act_declaree"), parProp).toBe(false);
    }
  });

  it("🟢 CONTRÔLE POSITIF : prop et déclencheur s'accordent", () => {
    for (const parProp of ["button", "empty_state"]) {
      expect(executee(doc(parProp, "act_declaree"), "act_declaree"), parProp).toBe(true);
    }
  });

  it("🟢 `form` et `list` résolvent par le DÉCLENCHEUR — jamais pénalisés", () => {
    // `actionRefProps` vide : le runtime lit `uiActionsByBlock`. Leur appliquer
    // la règle de la prop refuserait un câblage parfaitement valide.
    for (const parTrigger of ["form", "list"]) {
      expect(executee(doc(parTrigger, undefined, "ent_a"), "act_declaree"), parTrigger).toBe(true);
    }
  });

  it("CONTRÔLE NÉGATIF : sans la règle, le cas mort passerait pour exécuté", () => {
    // L'ancienne définition — enveloppe seule — aurait répondu `true` sur le
    // premier cas. Sans cette démonstration, le test positif ne prouverait rien.
    const d = doc("button", "act_autre");
    const a = d.actions.find((x) => x.id === "act_declaree");
    const ancienneDefinition =
      EXECUTION_ENVELOPE_V1.effects.includes(a?.effect.kind as never) &&
      EXECUTION_ENVELOPE_V1.triggers.includes(a?.trigger.kind as never);
    expect(ancienneDefinition, "l'ancienne règle acceptait ce cas").toBe(true);
    expect(executee(d, "act_declaree"), "la nouvelle le refuse").toBe(false);
  });
});
