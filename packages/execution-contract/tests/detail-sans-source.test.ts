// ÉCRANS DE DÉTAIL SANS SOURCE D'IDENTIFIANT — cas-tueurs.
//
// CAUSE RACINE, vérifiée dans le runtime compilé : seul `useItemNavigate`
// transmet `{itemId}`, et il n'est câblé que sur les LIGNES DE LISTE. La
// navigation par BOUTON appelle `navigation.navigate(screenId)` SANS aucun
// paramètre. Un écran de détail qu'aucune ligne n'atteint ne peut donc jamais
// recevoir d'identifiant — et le fournisseur retombe sur `rows[0]`, EN SILENCE.
//
// MESURÉ sur le corpus v3 : **24 écrans de détail sur 32 (75 %)** sont dans ce
// cas, dont **23 sur une entité à plusieurs lignes** (28/34 et 27 avant la
// régénération de `livraison-fruits`, D-117). Presser « le troisième »
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

describe("cliquet de régression — les défauts du corpus v3 ne remontent jamais", () => {
  const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus");
  const documents = readdirSync(join(RACINE, "corpus-v3"))
    .filter((f) => f.endsWith(".air.json"))
    .sort()
    .map((f) => ({
      nom: f.replace(".air.json", ""),
      air: migrateAirDocument(JSON.parse(readFileSync(join(RACINE, "corpus-v3", f), "utf8"))),
    }));

  // ÉDITION CONSCIENTE (2026-09-01, B′ après D-117) : cliquet exact 28/34 →
  // PLAFOND absolu 24. Le corpus v3 est destiné à être régénéré document par
  // document (9 restants) : une égalité exacte rougirait à chaque amélioration
  // sans distinguer une régression. Le plafond ne mord que sur une HAUSSE du
  // défaut ; il se RESSERRE à chaque régénération réussie, ne monte jamais.
  // Aucun plancher sur la population : `livraison-fruits` a PERDU 2
  // `detail_header` mal posés — une amélioration qu'un plancher aurait
  // déclarée amputation.
  it("🔴 les écrans de détail SANS SOURCE ne remontent jamais — plafond 24", () => {
    const tous = documents.flatMap((d) => detailScreens(d.air));
    const orphelins = tous.filter((x) => !x.hasItemIdSource);
    expect(orphelins.length).toBeLessThanOrEqual(24);
  });

  // ÉDITION CONSCIENTE (2026-09-01, B′ après D-117) : égalité exacte →
  // INCLUSION monotone. Un document qui sort de cet ensemble a soit RECHUTÉ,
  // soit perdu TOUS ses écrans de détail (le filtre exige ds.length > 0) —
  // deux régressions. Chaque document assaini par une régénération consignée
  // s'AJOUTE ici ; on ne retire jamais un nom sans décision.
  it("un document assaini ne rechute jamais — l'ensemble des sains ne peut que croître", () => {
    const sains = documents
      .filter((d) => {
        const ds = detailScreens(d.air);
        return ds.length > 0 && ds.every((x) => x.hasItemIdSource);
      })
      .map((d) => d.nom);
    expect(sains.length).toBeGreaterThan(0);
    for (const attendu of ["coach-fitness", "livraison-fruits", "plombier-urgence"]) {
      expect(sains, `document assaini sorti de l'ensemble : ${attendu}`).toContain(attendu);
    }
  });
});
