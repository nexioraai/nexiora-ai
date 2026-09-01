// MATRICE DU PÉRIMÈTRE DE RÉPARATION (D-093) — dérivée du cas RÉEL P5.
//
// CAUSE RACINE : le garde autorisait une mutation si l'identifiant du nœud
// apparaissait QUELQUE PART dans le texte des diagnostics. Faux dans les deux
// sens — trop lâche (un id cité autorisait TOUT sur ce nœud), trop strict
// (quand le diagnostic nomme la VALEUR À REMPLACER, la réparation attendue
// était refusée). Mesuré sur données réelles : 16 réparations légitimes
// rejetées, document laissé invalide.
//
// RÈGLE : le CHEMIN du diagnostic désigne le nœud ET la propriété corrigeable.
//   mutation autorisée ⟺ elle porte sur une propriété qu'un diagnostic désigne
import { describe, expect, it } from "vitest";
import { amputationsHorsPerimetre, mutationsHorsPerimetre } from "../src/repair-scope.ts";

/** Reproduction fidèle de la structure du document P5. */
const doc = () => ({
  airSchemaVersion: "1.6.0",
  entities: [
    { id: "ent_prestation", fields: [{ id: "fld_prestation_photo", type: "asset" }] },
    { id: "ent_demande", fields: [{ id: "fld_demande_photo", type: "asset" }] },
  ],
  relations: [{ id: "rel_1", fromEntityId: "ent_demande", toEntityId: "ent_prestation" }],
  screens: [{ id: "scr_accueil", blocks: [{ id: "blk_accueil_urgences", blockType: "list" }] }],
  actions: [{ id: "act_ouvrir", effect: { kind: "navigate" } }],
  // Le cas P5 exact : la promesse vise un BLOC, cible invalide.
  expectedTests: [{ id: "test_accueil_urgences_visibles", targetId: "blk_accueil_urgences" }],
  intent: { needs: [{ id: "need_1", resolution: { kind: "satisfied" } }] },
});

/** Le diagnostic RÉEL de P5, chemin compris. */
const DIAG_CIBLE = [
  {
    code: "AIR_TEST_TARGET_UNKNOWN",
    path: "expectedTests[0].targetId",
    message: 'cible "blk_accueil_urgences" introuvable (écran, action ou entité)',
  },
];

type Doc = ReturnType<typeof doc>;
/** Accès nommés : ni index, ni assertion non-null (interdits par le lint). */
const promesse = (d: Doc) => {
  const t = d.expectedTests.find((x) => x.id === "test_accueil_urgences_visibles");
  if (t === undefined) throw new Error("promesse absente de la fixture");
  return t;
};
const entite = (d: Doc, id: string) => {
  const e = d.entities.find((x) => x.id === id);
  if (e === undefined) throw new Error(`entité ${id} absente`);
  return e;
};
const action = (d: Doc) => {
  const a = d.actions.find((x) => x.id === "act_ouvrir");
  if (a === undefined) throw new Error("action absente");
  return a;
};
const refus = (mut: (d: Doc) => void, diags: readonly { code: string; path: string; message?: string }[] = DIAG_CIBLE) => {
  const avant = doc();
  const apres = doc();
  mut(apres);
  return [
    ...amputationsHorsPerimetre(avant, apres, diags),
    ...mutationsHorsPerimetre(avant, apres, diags).map((m) => m.id),
  ];
};

describe("A · targetId de promesse — le cas P5", () => {
  it("① LA RÉPARATION RÉELLE DE P5 : bloc → écran est ACCEPTÉE", () => {
    expect(refus((d) => { promesse(d).targetId = "scr_accueil"; })).toEqual([]);
  });

  it("② remplacement vers une AUTRE cible reste accepté — le périmètre, pas la valeur", () => {
    // Le garde ne juge pas la JUSTESSE de la nouvelle cible : c'est le rôle du
    // validateur, qui refusera une cible inexistante. Le garde ne juge que le
    // PÉRIMÈTRE. Confondre les deux rôles avait produit le faux positif.
    expect(refus((d) => { promesse(d).targetId = "act_ouvrir"; })).toEqual([]);
  });

  it("③ SUPPRIMER la promesse est REFUSÉ — le diagnostic ne vise qu'une propriété", () => {
    expect(refus((d) => { d.expectedTests = []; })).toEqual(["test_accueil_urgences_visibles"]);
  });

  it("④ targetId modifié SANS diagnostic l'autorisant est REFUSÉ", () => {
    expect(
      refus((d) => { promesse(d).targetId = "scr_accueil"; }, [
        { code: "AIR_IMAGE_ORPHELINE", path: "entities[0].fields[0]" },
      ]),
    ).toEqual(["test_accueil_urgences_visibles"]);
  });

  it("⑤ diagnostic AMBIGU (chemin introuvable) → REFUS par défaut", () => {
    expect(
      refus((d) => { promesse(d).targetId = "scr_accueil"; }, [
        { code: "AIR_TEST_TARGET_UNKNOWN", path: "expectedTests[99].targetId" },
      ]),
    ).toEqual(["test_accueil_urgences_visibles"]);
  });
});

describe("B · réparation légitime + mutation étrangère — toutes REFUSÉES", () => {
  const combine = (etrangere: (d: ReturnType<typeof doc>) => void) =>
    refus((d) => {
      promesse(d).targetId = "scr_accueil"; // la réparation légitime
      etrangere(d); // et la mutation qui en profite
    });

  it("⑥ + suppression d'un champ asset non demandée", () => {
    expect(combine((d) => { entite(d, "ent_prestation").fields = []; })).toEqual(["fld_prestation_photo"]);
  });

  it("⑦ + dénaturation d'un champ", () => {
    expect(combine((d) => { entite(d, "ent_prestation").fields = [{ id: "fld_prestation_photo", type: "string" }]; })).toEqual([
      "fld_prestation_photo",
    ]);
  });

  it("⑧ + mutation d'une relation", () => {
    expect(
      combine((d) => {
        d.relations = [{ id: "rel_1", fromEntityId: "ent_prestation", toEntityId: "ent_demande" }];
      }),
    ).toEqual(["rel_1"]);
  });

  it("⑨ + changement de version", () => {
    expect(combine((d) => { d.airSchemaVersion = "1.1.0"; })).toEqual(["<document>"]);
  });

  it("⑩ + déplacement d'un champ vers une autre entité", () => {
    expect(
      combine((d) => {
        entite(d, "ent_prestation").fields = [];
        entite(d, "ent_demande").fields.push({ id: "fld_prestation_photo", type: "asset" });
      }),
    ).toEqual(["fld_prestation_photo"]);
  });

  it("⑪ + changement de l'effet d'une action", () => {
    expect(combine((d) => { action(d).effect = { kind: "mutation" }; })).toEqual(["act_ouvrir"]);
  });

  it("⑫ + bascule de la résolution d'un besoin", () => {
    expect(
      combine((d) => { d.intent = { needs: [{ id: "need_1", resolution: { kind: "unexpressible" } }] }; }),
    ).toEqual(["need_1"]);
  });
});

describe("C · autres propriétés désignées par un chemin", () => {
  it("⑬ `actions[0].effect` désigné → changer l'effet est ACCEPTÉ", () => {
    expect(
      refus((d) => { action(d).effect = { kind: "mutation" }; }, [
        { code: "AIR_ACTION_SCREEN_UNKNOWN", path: "actions[0].effect.screenId" },
      ]),
    ).toEqual([]);
  });

  it("⑭ le MÊME diagnostic n'autorise PAS de toucher au reste du document", () => {
    expect(
      refus((d) => { entite(d, "ent_prestation").fields = [{ id: "fld_prestation_photo", type: "string" }]; }, [
        { code: "AIR_ACTION_SCREEN_UNKNOWN", path: "actions[0].effect.screenId" },
      ]),
    ).toEqual(["fld_prestation_photo"]);
  });

  it("⑮ un chemin sur le NŒUD ENTIER autorise sa suppression", () => {
    expect(
      refus((d) => { entite(d, "ent_prestation").fields = []; }, [
        { code: "AIR_IMAGE_ORPHELINE", path: "entities[0].fields[0]" },
      ]),
    ).toEqual([]);
  });

  it("⑯ CONTRÔLE POSITIF : un libellé n'est pas une identité", () => {
    expect(refus((d) => { Object.assign(entite(d, "ent_prestation"), { nom: "autre" }); })).toEqual([]);
  });
});
