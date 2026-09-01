// FORMULAIRES MUETS — cas-tueurs.
//
// CAUSE RACINE : le registre impose `actionId` à un `button` — « un CTA sans
// action » — et RIEN à un `form`, dont `actionRefProps` est vide. Le pont de
// validation ne vérifie que le sens inverse (`BLOCK_TRIGGER_SANS_AFFORDANCE`,
// D-104) : une action doit cibler un bloc actionnable, jamais qu'un bloc
// actionnable possède une action.
//
// MESURÉ sur les 24 documents : **7 formulaires muets sur 45 (15,6 %)** à la
// découverte (D-112) — **5 sur 48 (10,4 %)** depuis la régénération de
// `livraison-fruits` (D-117) — contre **0 bouton muet** (259 boutons alors,
// 250 ce jour). L'asymétrie est la signature de la cause : un défaut
// d'inattention du générateur toucherait les deux dans les mêmes proportions.
// Deux des formulaires restants portent un paiement ou une prise de
// rendez-vous.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrateAirDocument, type ProjectAir } from "@deribfy/air-schema";
import { formulairesSansAction } from "../src/graph.ts";
import { L, P, air, entity } from "./fixtures.ts";

const FORM = (id: string) => ({
  id,
  blockType: "form" as const,
  entityId: "ent_x",
  props: P({ submitLabel: "S", fieldIds: ["fld_x_f0"] }),
});
const ecran = (id: string, blocks: ProjectAir["screens"][number]["blocks"]) => ({
  id,
  title: L(id),
  blocks,
});

describe("un formulaire promet une soumission", () => {
  it("🔴 CAS-TUEUR : un `form` qu'aucune action ne déclenche est SIGNALÉ", () => {
    const document = air({
      entities: [entity("ent_x")],
      screens: [ecran("scr_a", [FORM("blk_muet")])],
      navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] },
    });
    expect(formulairesSansAction(document)).toEqual([
      { screenId: "scr_a", blockId: "blk_muet" },
    ]);
  });

  it("🟢 CONTRÔLE POSITIF : un `form` câblé par un déclencheur `ui` n'est PAS signalé", () => {
    const document = air({
      entities: [entity("ent_x")],
      screens: [ecran("scr_a", [FORM("blk_cable")])],
      navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] },
      actions: [
        {
          id: "act_submit",
          name: "submit",
          trigger: { kind: "ui", blockId: "blk_cable" },
          effect: { kind: "mutation", entityId: "ent_x", operation: "create" },
        },
      ],
    });
    expect(formulairesSansAction(document)).toEqual([]);
  });

  it("🔴 la règle ne s'applique QU'aux formulaires — 104 faux positifs évités", () => {
    // Mesuré : appliquée aux quatre blocs affordants, elle signalerait 111 blocs
    // dont l'immense majorité sont des `list`. Une liste qui AFFICHE sans ouvrir
    // de détail est légitime ; un `empty_state` sans action aussi. Seul le `form`
    // rend TOUJOURS un bouton porteur d'une promesse.
    const document = air({
      entities: [entity("ent_x")],
      screens: [
        ecran("scr_a", [
          { id: "blk_liste", blockType: "list", entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) },
          { id: "blk_vide", blockType: "empty_state", props: P({ title: "V" }) },
        ]),
      ],
      navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] },
    });
    expect(formulairesSansAction(document)).toEqual([]);
  });

  it("le résultat est trié et déterministe", () => {
    const document = air({
      entities: [entity("ent_x")],
      screens: [ecran("scr_a", [FORM("blk_z"), FORM("blk_a")])],
      navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] },
    });
    expect(formulairesSansAction(document).map((f) => f.blockId)).toEqual(["blk_a", "blk_z"]);
  });
});

describe("cliquet de régression — l'état des deux corpus ne se dégrade jamais", () => {
  const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus");
  const charger = (dir: string) =>
    readdirSync(join(RACINE, dir))
      .filter((f) => f.endsWith(".air.json"))
      .sort()
      .map((f) => ({
        nom: `${dir}/${f.replace(".air.json", "")}`,
        air: migrateAirDocument(JSON.parse(readFileSync(join(RACINE, dir, f), "utf8"))),
      }));

  // ÉDITION CONSCIENTE (2026-09-01, B′ après D-117) : « EXACTEMENT 7 » +
  // liste d'ids figée → PLAFOND absolu 5 + ensemble des DOCUMENTS porteurs.
  // Une régénération renouvelle TOUS les ids de blocs : les figer rendait le
  // cliquet périssable par construction, sans détection en échange. Les noms
  // de documents sont stables, et l'ensemble détecte une CONTAMINATION
  // (nouveau document porteur) même à total constant — le trou de
  // compensation d'un plafond seul. Le plafond se resserre à chaque
  // régénération réussie, ne monte jamais.
  it("🔴 les formulaires muets ne remontent jamais — plafond 5, deux documents porteurs connus", () => {
    const trouves = charger("corpus-v3").flatMap((d) =>
      formulairesSansAction(d.air).map((f) => ({ document: d.nom, blockId: f.blockId })),
    );
    expect(trouves.length).toBeLessThanOrEqual(5);
    const PORTEURS_CONNUS = ["corpus-v3/billetterie-concerts", "corpus-v3/toiletteur-chiens"];
    for (const t of trouves) {
      expect(PORTEURS_CONNUS, `document nouvellement contaminé : ${t.document}`).toContain(
        t.document,
      );
    }
  });

  it("🟢 le corpus v2 GELÉ n'en porte AUCUN — le diagnostic ne l'invalide pas", () => {
    // Décisif : ce diagnostic ne doit rendre invalide aucun document gelé.
    for (const d of charger("corpus-v2")) {
      expect(formulairesSansAction(d.air), d.nom).toEqual([]);
    }
  });
});
