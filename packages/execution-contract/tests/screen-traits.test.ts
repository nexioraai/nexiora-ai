// TRAITS STRUCTURELS D'ÉCRAN — cas-tueurs.
//
// CAUSE RACINE : les règles de composition sectorielle exigeaient de savoir ce
// qu'un écran EST. Deux voies étaient possible : un champ `role` déclaré à
// l'AIR, ou une dérivation.
//
// La première est REFUSÉE deux fois. `D-086` d'abord : l'AIR ne connaît aucune
// catégorie métier, sous peine de rendre le moteur non agnostique. La mesure
// ensuite : **45 écrans sur 154 (29 %)** au moment de la décision — **47 sur
// 155 (30 %)** depuis la régénération de `livraison-fruits` (D-117) — portent
// plus d'un trait. Un `role` à valeur unique serait faux par construction sur
// plus d'un écran sur quatre.
//
// Ce fichier tient l'ensemble : traits CUMULABLES, dérivés des blocs réels.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrateAirDocument, type ProjectAir } from "@deribfy/air-schema";
import { SCREEN_TRAITS, detailScreens, screenTraits } from "../src/graph.ts";
import { L, P, air, entity } from "./fixtures.ts";

const traitsDe = (document: ProjectAir, screenId: string): readonly string[] =>
  screenTraits(document).find((t) => t.screenId === screenId)?.traits ?? [];

const ecran = (id: string, blocks: ProjectAir["screens"][number]["blocks"]) => ({
  id,
  title: L(id),
  blocks,
});
const BH = { id: "blk_h", blockType: "header" as const, props: P({ title: "H" }) };

describe("traits cumulables — le cas que le rôle unique ne peut pas dire", () => {
  it("🔴 CAS-TUEUR : un écran `detail_header` + `list` porte LES DEUX traits", () => {
    // 20 occurrences mesurées sur les corpus. Une fiche et la liste de ses
    // éléments liés : composition normale, pas un défaut.
    const document = air({
      entities: [entity("ent_x")],
      screens: [
        ecran("scr_a", [BH]),
        ecran("scr_b", [
          { id: "blk_b_d", blockType: "detail_header", entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) },
          { id: "blk_b_l", blockType: "list", entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) },
        ]),
      ],
      navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] },
    });
    expect(traitsDe(document, "scr_b")).toEqual(["detail", "listing"]);
  });

  it("les trois traits de contenu coexistent — le cas à 1 occurrence", () => {
    const document = air({
      entities: [entity("ent_x")],
      screens: [
        ecran("scr_a", [BH]),
        ecran("scr_b", [
          { id: "blk_b_d", blockType: "detail_header", entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) },
          { id: "blk_b_l", blockType: "list", entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) },
          { id: "blk_b_f", blockType: "form", entityId: "ent_x", props: P({ submitLabel: "S", fieldIds: ["fld_x_f0"] }) },
        ]),
      ],
      navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] },
    });
    expect(traitsDe(document, "scr_b")).toEqual(["detail", "listing", "form"]);
  });
});

describe("`statique` et `entry` — l'absence et l'orthogonalité", () => {
  it("un écran sans bloc de contenu porte `statique`, jamais un trait inventé", () => {
    expect(traitsDe(air(), "scr_a")).toEqual(["entry", "statique"]);
  });

  it("🔴 `entry` est ORTHOGONAL : il CUMULE, il ne remplace pas", () => {
    const document = air({
      entities: [entity("ent_x")],
      screens: [
        ecran("scr_a", [
          { id: "blk_a_l", blockType: "list", entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) },
        ]),
      ],
      navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] },
    });
    // Un accueil-catalogue reste un accueil ET un listing.
    expect(traitsDe(document, "scr_a")).toEqual(["entry", "listing"]);
    expect(traitsDe(document, "scr_a")).not.toContain("statique");
  });

  it("aucun écran ne rend jamais un ensemble VIDE", () => {
    const document = air({ screens: [ecran("scr_a", [BH]), ecran("scr_z", [{ ...BH, id: "blk_z" }])] });
    for (const t of screenTraits(document)) expect(t.traits.length).toBeGreaterThan(0);
  });
});

describe("déterminisme — le résultat ne dépend pas de l'ordre", () => {
  it("permuter les blocs ne change pas les traits", () => {
    const blocs = [
      { id: "blk_b_l", blockType: "list" as const, entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) },
      { id: "blk_b_d", blockType: "detail_header" as const, entityId: "ent_x", props: P({ titleFieldId: "fld_x_f0" }) },
    ];
    const faire = (b: typeof blocs): ProjectAir =>
      air({
        entities: [entity("ent_x")],
        screens: [ecran("scr_a", [BH]), ecran("scr_b", b)],
        navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] },
      });
    expect(traitsDe(faire(blocs), "scr_b")).toEqual(traitsDe(faire([...blocs].reverse()), "scr_b"));
  });

  it("les écrans sont rendus triés, et les traits dans l'ordre canonique", () => {
    const document = air({
      screens: [ecran("scr_z", [{ ...BH, id: "blk_z" }]), ecran("scr_a", [BH])],
      navigation: { entryScreenId: "scr_a", routes: [{ id: "nav_a", screenId: "scr_a" }] },
    });
    expect(screenTraits(document).map((t) => t.screenId)).toEqual(["scr_a", "scr_z"]);
    for (const t of screenTraits(document)) {
      const rangs = t.traits.map((x) => SCREEN_TRAITS.indexOf(x));
      expect([...rangs].sort((a, b) => a - b)).toEqual(rangs);
    }
  });
});

describe("cliquet de véracité — les traits dérivent des BLOCS RÉELS", () => {
  const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "golden-corpus");
  const documents = ["corpus-v2", "corpus-v3"].flatMap((dir) =>
    readdirSync(join(RACINE, dir))
      .filter((f) => f.endsWith(".air.json"))
      .sort()
      .map((f) => ({
        nom: `${dir}/${f}`,
        air: migrateAirDocument(JSON.parse(readFileSync(join(RACINE, dir, f), "utf8"))),
      })),
  );

  it("`detail` coïncide EXACTEMENT avec `detailScreens` — aucune recopie divergente", () => {
    // D-095 : la duplication se supprime à la source. Si ces deux mécanismes
    // cessaient de dire la même chose, l'un des deux mentirait.
    for (const { nom, air: document } of documents) {
      const parTraits = new Set(
        screenTraits(document).filter((t) => t.traits.includes("detail")).map((t) => t.screenId),
      );
      const parDetail = new Set(detailScreens(document).map((d) => d.screenId));
      expect([...parTraits].sort(), nom).toEqual([...parDetail].sort());
    }
  });

  it("🔴 CONTRÔLE NÉGATIF : un rôle UNIQUE serait faux sur plus d'un quart des écrans", () => {
    // C'est la mesure qui a refusé le champ `role`. Si elle tombait à zéro, la
    // dérivation par ensemble n'aurait plus de justification — ce test le dirait.
    // ÉDITION CONSCIENTE (2026-09-01, B′ après D-117) : les égalités exactes
    // 154 écrans / 45 ambigus sont RETIRÉES — la population mêle le corpus v2
    // GELÉ (47 écrans, déjà cliqueté à l'exact par corpus.test.ts) et le
    // corpus v3 destiné à être régénéré. L'INVARIANT qui fonde D-086 est le
    // seuil ci-dessous, INCHANGÉ. Mesuré ce jour : 47 ambigus sur 155 (30 %).
    const tous = documents.flatMap((d) => screenTraits(d.air));
    const contenu = tous.map((t) => t.traits.filter((x) => x !== "entry"));
    const ambigus = contenu.filter((c) => c.length > 1).length;
    expect(ambigus / tous.length).toBeGreaterThan(0.25);
  });

  it("chaque écran du corpus porte au moins un trait, et aucun trait inconnu", () => {
    for (const { nom, air: document } of documents) {
      for (const t of screenTraits(document)) {
        expect(t.traits.length, `${nom} ${t.screenId}`).toBeGreaterThan(0);
        for (const x of t.traits) expect(SCREEN_TRAITS, `${nom} ${x}`).toContain(x);
      }
    }
  });
});
