// D-090 — TOUTE PROP QUI DÉSIGNE UN CHAMP DOIT ÊTRE VÉRIFIÉE COMME TELLE.
//
// CAUSE RACINE : `imageFieldId` et `searchFieldId` ont été ajoutés au
// `propsSchema` du registre 1.2.0 sans être ajoutés à `fieldRefProps`. Or c'est
// cette liste — et elle seule — qui fait vérifier qu'une prop désigne un champ
// de l'entité LIÉE.
//
// CONSÉQUENCE MESURÉE : pointer `imageFieldId` vers un champ inexistant, ou
// vers le champ d'une AUTRE entité, passait la validation. Pire, cela FAISAIT
// TAIRE le diagnostic d'image orpheline — le champ comptait comme « montré »
// alors que le runtime ne rendait rien. L'exigence d'image devenait
// contournable par une simple référence croisée.
//
// Ce cliquet ne corrige pas un cas : il rend l'OMISSION impossible.
import { describe, expect, it } from "vitest";
import { BLOCKS } from "../src/definitions.ts";

describe("exhaustivité de fieldRefProps (D-090)", () => {
  it("toute prop nommée *FieldId est déclarée dans fieldRefProps", () => {
    const manquantes: string[] = [];
    for (const b of BLOCKS) {
      // La forme du schéma n'est pas introspectable simplement : on lit les
      // clés que le registre expose déjà par ailleurs.
      const clefs = Object.keys(
        (b.propsSchema as unknown as { shape?: Record<string, unknown> }).shape ?? {},
      );
      for (const k of clefs) {
        if (!/FieldIds?$/.test(k)) continue;
        if (b.fieldRefProps.includes(k)) continue;
        manquantes.push(`${b.id}.${k}`);
      }
    }
    expect(
      manquantes,
      `props qui désignent un champ sans être vérifiées : ${manquantes.join(", ")}`,
    ).toEqual([]);
  });

  it("les deux props ajoutées en 1.2.0 y sont explicitement", () => {
    // Contrôle nommé : si quelqu'un les retire, ce test le dit tout de suite.
    const list = BLOCKS.find((b) => b.id === "list");
    const detail = BLOCKS.find((b) => b.id === "detail_header");
    expect(list?.fieldRefProps).toContain("imageFieldId");
    expect(list?.fieldRefProps).toContain("searchFieldId");
    expect(detail?.fieldRefProps).toContain("imageFieldId");
  });

  it("CONTRÔLE NÉGATIF : le test sait détecter une omission", () => {
    // Sans lui, un `fieldRefProps` vide passerait pour exhaustif.
    const faux: { propsSchema: { shape: Record<string, unknown> }; fieldRefProps: string[] } = {
      propsSchema: { shape: { imageFieldId: {} } },
      fieldRefProps: [],
    };
    const clefs = Object.keys(faux.propsSchema.shape);
    const manquantes = clefs.filter(
      (k) => /FieldIds?$/.test(k) && !faux.fieldRefProps.includes(k),
    );
    expect(manquantes).toEqual(["imageFieldId"]);
  });
});
