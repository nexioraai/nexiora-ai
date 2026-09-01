// ÉCRANS DE DÉTAIL SANS SOURCE D'IDENTIFIANT — cas-tueurs.
//
// CAUSE RACINE, vérifiée dans le runtime compilé : seul `useItemNavigate`
// transmet `{itemId}`, et il n'est câblé que sur les LIGNES DE LISTE. La
// navigation par BOUTON appelle `navigation.navigate(screenId)` SANS aucun
// paramètre. Un écran de détail qu'aucune ligne n'atteint ne peut donc jamais
// recevoir d'identifiant — et le fournisseur retombe sur `rows[0]`, EN SILENCE.
//
// MESURÉ sur le corpus v3 : **28 écrans de détail sur 34 (82 %)** sont dans ce
// cas, dont **27 sur une entité à plusieurs lignes**. Presser « le troisième »
// affiche « le premier », sans erreur ni état vide.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrateAirDocument, type ProjectAir } from "@deribfy/air-schema";
import { detailScreens } from "../src/graph.ts";
import { L, P, air, entity } from "./fixtures.ts";

const DETAIL = {
  id: "blk_detail",
  blockType: "detail_header" as const,
  entityId: "ent_x",
  props: P({ titleFieldId: "fld_x_f0" }),
};
const LISTE = {
  id: "blk_liste",
  blockType: "list" as const,
  entityId: "ent_x",
  props: P({ titleFieldId: "fld_x_f0" }),
};
const ecran = (id: string, blocks: ProjectAir["screens"][number]["blocks"]) => ({
  id,
  title: L(id),
  blocks,
});
const BOUTON = (actionId: string) => ({
  id: "blk_btn",
  blockType: "button" as const,
  props: P({ label: "Voir", actionId }),
});

const doc = (blocksA: ProjectAir["screens"][number]["blocks"], actions: ProjectAir["actions"]) =>
  air({
    entities: [entity("ent_x")],
    screens: [ecran("scr_a", blocksA), ecran("scr_detail", [DETAIL])],
    navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] },
    actions,
  });

const sansSource = (d: ProjectAir) =>
  detailScreens(d)
    .filter((x) => !x.hasItemIdSource)
    .map((x) => x.screenId);

describe("un détail doit être ouvert par une LIGNE, pas par un bouton", () => {
  it("🔴 CAS-TUEUR : un détail qu'aucune ligne n'atteint est SIGNALÉ", () => {
    expect(sansSource(doc([LISTE], []))).toEqual(["scr_detail"]);
  });

  it("🔴 CAS-TUEUR : un BOUTON qui mène au détail ne suffit PAS", () => {
    // Vérifié dans le runtime : `navigation.navigate(screenId)` sans paramètre.
    // L'écran est atteint, mais avec le mauvais enregistrement.
    const d = doc(
      [LISTE, BOUTON("act_voir")],
      [
        {
          id: "act_voir",
          name: "voir",
          trigger: { kind: "ui", blockId: "blk_btn" },
          effect: { kind: "navigate", screenId: "scr_detail" },
        },
      ],
    );
    expect(sansSource(d), "un bouton ne transmet aucun itemId").toEqual(["scr_detail"]);
  });

  it("🟢 CONTRÔLE POSITIF : une ligne de liste qui ouvre le détail satisfait la règle", () => {
    const d = doc(
      [LISTE],
      [
        {
          id: "act_ouvrir",
          name: "ouvrir",
          trigger: { kind: "ui", blockId: "blk_liste" },
          effect: { kind: "navigate", screenId: "scr_detail" },
        },
      ],
    );
    expect(sansSource(d)).toEqual([]);
  });
});

describe("cliquet de mesure — l'état RÉEL du corpus v3", () => {
  const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus");
  const documents = readdirSync(join(RACINE, "corpus-v3"))
    .filter((f) => f.endsWith(".air.json"))
    .sort()
    .map((f) => ({
      nom: f.replace(".air.json", ""),
      air: migrateAirDocument(JSON.parse(readFileSync(join(RACINE, "corpus-v3", f), "utf8"))),
    }));

  it("🔴 28 écrans de détail sur 34 sont SANS SOURCE — le chiffre est figé", () => {
    const tous = documents.flatMap((d) => detailScreens(d.air));
    const orphelins = tous.filter((x) => !x.hasItemIdSource);
    expect(tous.length).toBe(34);
    expect(orphelins.length).toBe(28);
  });

  it("les 3 documents régénérés après D-088 sont les seuls à tenir la chaîne", () => {
    const sains = documents
      .filter((d) => {
        const ds = detailScreens(d.air);
        return ds.length > 0 && ds.every((x) => x.hasItemIdSource);
      })
      .map((d) => d.nom);
    expect(sains).toEqual(["coach-fitness", "plombier-urgence"]);
  });
});
