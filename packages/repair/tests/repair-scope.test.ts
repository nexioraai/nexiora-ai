// CAS-TUEURS DU PÉRIMÈTRE DE RÉPARATION (D-088 · D1).
//
// Le défaut fondateur, mesuré sur documents réels : la boucle ne réémettait
// que la section où le défaut s'OBSERVE. Sur 3 classes de défauts sur 4, cette
// section ne pouvait pas porter le correctif — la seule issue restante était
// de SUPPRIMER la référence fautive. Ces tests fixent les deux garanties :
// le correctif devient POSSIBLE, l'amputation devient IMPOSSIBLE.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SECTIONS_CORRECTIVES,
  amputationsHorsPerimetre,
  denaturationsHorsPerimetre,
  mutationsHorsPerimetre,
  identifiantsDuDocument,
  sectionDuChemin,
  sectionsAReemettre,
} from "../src/repair-scope.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..", "..");
const read = (rel: string): string => readFileSync(join(PKG, rel), "utf8");

describe("routage — la section qui porte le correctif est réémise", () => {
  // Les quatre cas-tueurs, avec la section OÙ VIT RÉELLEMENT le correctif.
  const CAS = [
    ["① image orpheline", "AIR_IMAGE_ORPHELINE", "entities[1].fields[2]", "ecrans"],
    ["② entité affichée absente", "AIR_BLOCK_ENTITY_UNKNOWN", "screens[0].blocks[1]", "donnees"],
    ["③ promesse sans cible", "AIR_TEST_TARGET_UNKNOWN", "expectedTests[0]", "actions"],
    ["④ destination morte", "AIR_NAV_DESTINATION_DEAD", "navigation.primary", "actions"],
  ] as const;

  for (const [nom, code, path, sectionCorrective] of CAS) {
    it(`${nom} : « ${sectionCorrective} » est réémise`, () => {
      expect(sectionsAReemettre([{ code, path }])).toContain(sectionCorrective);
    });

    it(`${nom} : l'ancien routage par chemin ne l'atteignait PAS`, () => {
      // Contrôle négatif — sans lui, on ne saurait pas que la règle sert.
      if (nom === "② entité affichée absente") {
        // Seul cas où observation et correctif coïncidaient déjà.
        expect(sectionDuChemin(path)).toBe("ecrans");
        return;
      }
      expect(sectionDuChemin(path)).not.toBe(sectionCorrective);
    });
  }

  it("CLIQUET D'EXHAUSTIVITÉ : tout code de diagnostic a une entrée", () => {
    // Un code oublié retomberait silencieusement sur la section d'observation
    // — exactement le défaut d'origine. Ajouter un diagnostic sans décider de
    // son périmètre fait ÉCHOUER ce test.
    const sources =
      read("air-schema/src/validate.ts") +
      read("blocks/src/registry.ts") +
      read("capability-registry/src/index.ts");
    const codes = [
      ...new Set(
        (sources.match(/"(?:AIR|BLOCK)_[A-Z_]+"/g) ?? []).map((c) => c.replaceAll('"', "")),
      ),
    ];
    expect(codes.length, "aucun code trouvé — la lecture des sources a échoué").toBeGreaterThan(30);
    const orphelins = codes.filter((c) => !(c in SECTIONS_CORRECTIVES));
    expect(
      orphelins,
      `codes sans périmètre de réparation : ${orphelins.join(", ")}`,
    ).toEqual([]);
  });
});

describe("FORM_SANS_ACTION — la réparation doit viser `actions`", () => {
  // Ce code ne vit ni dans `validate.ts` ni dans `registry.ts` : il est produit
  // par la validation de campagne (`emit-v3`), volontairement HORS du pont
  // consommé en fail-closed par le compilateur. Le cliquet de complétude
  // ci-dessus ne le voit donc pas — celui-ci l'épingle.
  it("🔴 un formulaire muet fait réémettre `actions`, jamais seulement `ecrans`", () => {
    const sections = sectionsAReemettre([
      { code: "FORM_SANS_ACTION", path: "screens[scr_a].blocks[blk_muet]" },
    ]);
    expect(sections).toContain("actions");
  });

  it("🔴 CONTRÔLE NÉGATIF : sans le mappage, le chemin renverrait vers `ecrans` seul", () => {
    // Le repli `sectionDuChemin` déduit la section du CHEMIN. Or le défaut
    // s'observe dans `screens` alors que le correctif vit dans `actions` :
    // c'est exactement la fourche que D-088 a mesurée, et qui ne laissait au
    // modèle que la suppression pour issue.
    expect(sectionDuChemin("screens[scr_a].blocks[blk_muet]")).not.toBe("actions");
  });
});

describe("anti-amputation — ce que nul diagnostic ne désigne ne disparaît pas", () => {
  const avant = {
    entities: [{ id: "ent_a", fields: [{ id: "fld_photo" }] }, { id: "ent_b" }],
    screens: [{ id: "scr_1", blocks: [{ id: "blk_1" }] }],
    actions: [{ id: "act_1" }],
    expectedTests: [{ id: "test_1" }],
  };

  it("recense les identifiants de toutes les sections", () => {
    expect(identifiantsDuDocument(avant)).toEqual(
      new Set(["ent_a", "fld_photo", "ent_b", "scr_1", "blk_1", "act_1", "test_1"]),
    );
  });

  it("🔴 supprimer un nœud QUE NUL DIAGNOSTIC NE DÉSIGNE est refusé", () => {
    const apres = { ...avant, actions: [] };
    const hors = amputationsHorsPerimetre(avant, apres, [
      { code: "AIR_IMAGE_ORPHELINE", path: "entities[0].fields[0]" },
    ]);
    expect(hors).toEqual(["act_1"]);
  });

  it("🟢 supprimer le nœud QUE LE DIAGNOSTIC DÉSIGNE reste permis", () => {
    const apres = { ...avant, entities: [{ id: "ent_a", fields: [] }, { id: "ent_b" }] };
    expect(
      amputationsHorsPerimetre(avant, apres, [
        {
          code: "AIR_IMAGE_ORPHELINE",
          path: "entities[0].fields[0]",
          message: '"fld_photo" est déclaré et montré par aucun bloc',
        },
      ]),
    ).toEqual([]);
  });

  it("🔴 L'ÉCHAPPATOIRE HISTORIQUE : supprimer le champ image sans que le diagnostic le nomme", () => {
    // Le diagnostic désigne l'entité, pas le champ. Supprimer le champ est
    // alors hors périmètre — c'est très exactement l'amputation observée.
    const apres = { ...avant, entities: [{ id: "ent_a", fields: [] }, { id: "ent_b" }] };
    expect(
      amputationsHorsPerimetre(avant, apres, [{ code: "AIR_IMAGE_ORPHELINE", path: "entities[0]" }]),
    ).toEqual(["fld_photo"]);
  });

  it("🟢 CONTRÔLE POSITIF : une réparation qui n'enlève rien passe", () => {
    const apres = {
      ...avant,
      screens: [{ id: "scr_1", blocks: [{ id: "blk_1" }, { id: "blk_2" }] }],
    };
    expect(amputationsHorsPerimetre(avant, apres, [])).toEqual([]);
  });

  it("🟢 un simple RENOMMAGE de valeur n'est pas une amputation", () => {
    const apres = structuredClone(avant);
    (apres.screens[0] as { titre?: string }).titre = "nouveau";
    expect(amputationsHorsPerimetre(avant, apres, [])).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-089 — LA DÉNATURATION : une disparition qui garde l'identifiant.
//
// Trouvée en cherchant des échappatoires APRÈS les corrections. Changer le
// `type` d'un champ `asset` en `string` conserve son id : aucune amputation
// n'est détectée, et pourtant l'image a disparu de tout contrôle — plus
// d'orpheline possible, plus d'obligation d'affichage. Le nœud survit, sa
// NATURE est amputée.
// ══════════════════════════════════════════════════════════════════════════
describe("dénaturation — changer ce qu'un nœud EST", () => {
  const avant = { entities: [{ id: "ent_a", fields: [{ id: "fld_photo", type: "asset" }] }] };

  it("🔴 retyper un champ `asset` en `string` est REFUSÉ", () => {
    const apres = { entities: [{ id: "ent_a", fields: [{ id: "fld_photo", type: "string" }] }] };
    expect(denaturationsHorsPerimetre(avant, apres, [])).toEqual([
      { id: "fld_photo", avant: "asset", apres: "string" },
    ]);
    // Et l'amputation seule ne l'aurait PAS vu — c'est tout l'intérêt.
    expect(amputationsHorsPerimetre(avant, apres, [])).toEqual([]);
  });

  it("🟢 retyper le champ QUE LE DIAGNOSTIC NOMME reste permis", () => {
    const apres = { entities: [{ id: "ent_a", fields: [{ id: "fld_photo", type: "string" }] }] };
    expect(
      denaturationsHorsPerimetre(avant, apres, [
        { code: "AIR_IMAGE_ORPHELINE", path: "entities[0].fields[0]", message: '"fld_photo" orphelin' },
      ]),
    ).toEqual([]);
  });

  it("🟢 CONTRÔLE POSITIF : renommer un LIBELLÉ n'est pas une dénaturation", () => {
    const apres = {
      entities: [{ id: "ent_a", fields: [{ id: "fld_photo", type: "asset", nom: "autre" }] }],
    };
    expect(denaturationsHorsPerimetre(avant, apres, [])).toEqual([]);
  });

  it("🟢 supprimer le champ n'est pas une dénaturation — c'est une amputation", () => {
    const apres = { entities: [{ id: "ent_a", fields: [] }] };
    expect(denaturationsHorsPerimetre(avant, apres, [])).toEqual([]);
    expect(amputationsHorsPerimetre(avant, apres, [])).toEqual(["fld_photo"]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-091 — L'IDENTITÉ N'EST PAS L'IDENTIFIANT (passe 4).
//
// `amputations` comparait des ENSEMBLES d'identifiants, jamais une
// APPARTENANCE. Quatre transformations passaient en conservant l'identifiant :
// déplacer un champ vers une autre entité (ou une entité NEUVE non affichée),
// retourner une relation, changer la version pendant la réparation, basculer
// la résolution d'un besoin. Déplacer un champ `asset` éteignait
// `AIR_IMAGE_ORPHELINE` sans qu'aucun nœud ne disparaisse.
// ══════════════════════════════════════════════════════════════════════════
describe("empreinte sémantique — le même id ne suffit pas", () => {
  const avant = {
    airSchemaVersion: "1.6.0",
    entities: [
      { id: "ent_a", fields: [{ id: "fld_photo", type: "asset" }] },
      { id: "ent_b", fields: [] },
    ],
    relations: [{ id: "rel_1", fromEntityId: "ent_a", toEntityId: "ent_b" }],
    actions: [{ id: "act_1", effect: { kind: "navigate" } }],
    intent: { needs: [{ id: "need_1", resolution: { kind: "satisfied" } }] },
  };
  type Doc = typeof avant;
  /** Accès nommé : ni index, ni assertion — le lint interdit les deux. */
  const ent = (d: Doc, id: string) => {
    const e = d.entities.find((x) => x.id === id);
    if (e === undefined) throw new Error(`entité ${id} absente de la fixture`);
    return e;
  };
  const muter = (fn: (d: Doc) => void) => {
    const d = structuredClone(avant);
    fn(d);
    return mutationsHorsPerimetre(avant, d, []).map((m) => m.id);
  };

  it("🔴 DÉPLACER un champ vers une autre entité est REFUSÉ", () => {
    expect(
      muter((d) => {
        ent(d, "ent_a").fields = [];
        ent(d, "ent_b").fields = [{ id: "fld_photo", type: "asset" }];
      }),
    ).toEqual(["fld_photo"]);
  });

  it("🔴 déplacer vers une entité NEUVE non affichée est REFUSÉ", () => {
    expect(
      muter((d) => {
        ent(d, "ent_a").fields = [];
        d.entities.push({ id: "ent_neuve", fields: [{ id: "fld_photo", type: "asset" }] });
      }),
    ).toEqual(["fld_photo"]);
  });

  it("🔴 RETOURNER une relation est REFUSÉ", () => {
    expect(muter((d) => { d.relations = [{ id: "rel_1", fromEntityId: "ent_b", toEntityId: "ent_a" }]; })).toEqual(["rel_1"]);
  });

  it("🔴 changer `airSchemaVersion` pendant la réparation est REFUSÉ", () => {
    expect(muter((d) => { d.airSchemaVersion = "1.1.0"; })).toEqual(["<document>"]);
  });

  it("🔴 basculer un besoin SATISFAIT vers inexprimable est REFUSÉ", () => {
    expect(muter((d) => { d.intent = { needs: [{ id: "need_1", resolution: { kind: "unexpressible" } }] }; })).toEqual(["need_1"]);
  });

  it("🔴 changer l'EFFET d'une action est REFUSÉ", () => {
    expect(muter((d) => { d.actions = [{ id: "act_1", effect: { kind: "mutation" } }]; })).toEqual(["act_1"]);
  });

  it("🟢 CONTRÔLE POSITIF : la réparation SOUHAITÉE passe", () => {
    // Ajouter des nœuds, renommer un libellé : rien de tout cela n'est une
    // mutation d'identité. Sans ce contrôle, « tout refuser » suffirait.
    expect(
      muter((d) => {
        d.entities.push({ id: "ent_neuve", fields: [] });
        Object.assign(ent(d, "ent_a"), { nom: "autre libellé" });
      }),
    ).toEqual([]);
  });

  it("🟢 la mutation que le CHEMIN du diagnostic désigne reste permise", () => {
    // CORRECTION CONSCIENTE (D-093). Ce test attendait qu'un diagnostic portant
    // sur `entities[0]` autorise à DÉPLACER un de ses champs, au motif que le
    // message citait « fld_photo ». Cette attente contredisait son voisin, qui
    // exige le refus de la SUPPRESSION du même champ sous le même chemin.
    // La règle est désormais : le CHEMIN désigne le périmètre. Un diagnostic
    // sur l'entité n'autorise rien sur ses champs ; un diagnostic sur le champ
    // l'autorise. Les deux tests deviennent cohérents.
    const d = structuredClone(avant);
    ent(d, "ent_a").fields = [];
    ent(d, "ent_b").fields = [{ id: "fld_photo", type: "asset" }];
    expect(
      mutationsHorsPerimetre(avant, d, [
        { code: "AIR_IMAGE_ORPHELINE", path: "entities[0].fields[0]" },
      ]),
    ).toEqual([]);
  });

  it("🔴 le même déplacement sous un diagnostic portant sur l'ENTITÉ est REFUSÉ", () => {
    const d = structuredClone(avant);
    ent(d, "ent_a").fields = [];
    ent(d, "ent_b").fields = [{ id: "fld_photo", type: "asset" }];
    expect(
      mutationsHorsPerimetre(avant, d, [{ code: "AIR_IMAGE_ORPHELINE", path: "entities[0]" }]),
    ).toEqual([{ id: "fld_photo", avant: "champ:asset@ent_a", apres: "champ:asset@ent_b" }]);
  });
});
