// D-098 — LE CHEMIN DU DIAGNOSTIC DÉSIGNE LA RÉPARATION LÉGITIME.
//
// Éprouvé sur `coach-fitness`, document RÉEL et non modifié, parce que c'est
// lui qui a révélé le défaut : `AIR_IMAGE_ORPHELINE` pointait le CHAMP, donc
// le garde (D-093) autorisait sa SUPPRESSION — même quand un bloc capable de
// l'afficher existait. Supprimer valait réparer, et le document devenait
// valide sans qu'aucune image ne soit rendue.
//
// Désormais : porteur présent → le chemin désigne le BLOC, la suppression sort
// du périmètre. Aucun porteur → le champ reste désigné, la suppression demeure
// permise. Propriété DÉCIDABLE du document, jamais un cas particulier.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// 1.7.0 (E3.2) : migration SANS gate sémantique — cette fixture est un
// artefact VOLONTAIREMENT défectueux (orphelines gelées comme preuve pré-P8) ;
// la valider sémantiquement la rejetterait, vidant le test de son objet.
import { applyAirMigrations, projectAirSchema, validateAir } from "@deribfy/air-schema";
import { amputationsHorsPerimetre, mutationsHorsPerimetre } from "../src/repair-scope.ts";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
// ARTEFACT PRÉSERVÉ, non le corpus vivant. La génération P8 a régénéré
// `coach-fitness` sans aucune orpheline : pointer le corpus rendrait ce test
// vide de sens. La fixture est l'état GELÉ d'avant P8, versionné comme preuve.
const brut: unknown = JSON.parse(
  readFileSync(
    join(RACINE, "docs/elite-protocol/evidence/p8/coach-fitness-avant-p8.air.json"),
    "utf8",
  ),
);
const air = projectAirSchema.parse(applyAirMigrations(brut));
const diagnostics = validateAir(air).filter((d) => d.code === "AIR_IMAGE_ORPHELINE");

const refus = (mut: (d: typeof air) => void) => {
  const apres = structuredClone(air);
  mut(apres);
  return [
    ...amputationsHorsPerimetre(air, apres, diagnostics),
    ...mutationsHorsPerimetre(air, apres, diagnostics).map((m) => m.id),
  ];
};
const champsDe = (d: typeof air, entiteId: string) => {
  const e = d.entities.find((x) => x.id === entiteId);
  if (e === undefined) throw new Error(`entité ${entiteId} absente`);
  return e;
};
const blocDe = (d: typeof air, ecranId: string, type: string) => {
  const s = d.screens.find((x) => x.id === ecranId);
  const b = s?.blocks.find((x) => x.blockType === type);
  if (b === undefined) throw new Error(`bloc ${type} absent de ${ecranId}`);
  return b;
};

describe("coach-fitness — chemin, porteur et suppression légitime", () => {
  it("les trois orphelines sont diagnostiquées, avec le bon chemin", () => {
    expect(diagnostics).toHaveLength(3);
    const avecPorteur = diagnostics.filter((d) => /^screens\[\d+\]\.blocks\[\d+\]$/.test(d.path));
    const sansPorteur = diagnostics.filter((d) => /^entities\[\d+\]\.fields\[\d+\]$/.test(d.path));
    expect(avecPorteur, "fld_prog_couverture et fld_exo_vignette ont un porteur").toHaveLength(2);
    expect(sansPorteur, "fld_mem_photo n'en a aucun").toHaveLength(1);
    expect(sansPorteur[0]?.message).toContain("fld_mem_photo");
  });

  it("🟢 AFFICHER est permis — c'est la réparation attendue", () => {
    expect(
      refus((d) => {
        blocDe(d, "scr_programmes", "list").props = [
          ...(blocDe(d, "scr_programmes", "list").props ?? []),
          { key: "imageFieldId", value: "fld_prog_couverture" },
        ];
      }),
    ).toEqual([]);
  });

  it("🔴 SUPPRIMER un champ QUI A UN PORTEUR est refusé", () => {
    for (const [entite, champ] of [
      ["ent_programme", "fld_prog_couverture"],
      ["ent_exercice", "fld_exo_vignette"],
    ]) {
      const r = refus((d) => {
        const e = champsDe(d, entite ?? "");
        e.fields = e.fields.filter((f) => f.id !== champ);
      });
      expect(r, champ).toContain(champ);
    }
  });

  it("🟢 SUPPRIMER `fld_mem_photo` reste permis — aucun bloc ne peut l'afficher", () => {
    // `ent_membre` n'est porté que par `scr_compte/form`, et `form` n'a pas de
    // prop image. Interdire cette suppression rendrait le document irréparable.
    expect(
      refus((d) => {
        const e = champsDe(d, "ent_membre");
        e.fields = e.fields.filter((f) => f.id !== "fld_mem_photo");
      }),
    ).toEqual([]);
  });
});
