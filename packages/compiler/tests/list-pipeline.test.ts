// E1/E2 (D-129) — PREUVES DU PIPELINE PUR, cas-tueurs et contrôles négatifs.
//
// La règle du lot : une recherche réellement pilotée N'EST PAS un filtre
// statique déguisé, et une liste réellement scopée N'EST PAS une liste
// globale présentée comme relationnelle. Chaque assertion ci-dessous fait
// échouer l'une de ces impostures.
import { describe, expect, it } from "vitest";
import { lignesVisibles, optionsDistinctes } from "../runtime/list-pipeline";

const L = (id: string, values: Record<string, string>) => ({ id, values });
const TRAJETS = [
  L("t1", { dest: "Bouaké", date: "2026-09-03", heure: "08:00", route: "r1", statut: "ouvert" }),
  L("t2", { dest: "Yamoussoukro", date: "2026-09-03", heure: "09:00", route: "r2", statut: "ouvert" }),
  L("t3", { dest: "Bouaké", date: "2026-09-04", heure: "07:00", route: "r1", statut: "annule" }),
  L("t4", { dest: "Korhogo", date: "2026-09-03", heure: "10:00", route: "r3", statut: "ouvert" }),
];
const ids = (r: readonly { id: string }[]) => r.map((x) => x.id).join(",");

describe("E1 — la saisie PILOTE réellement les lignes", () => {
  it("🔴 CAS-TUEUR : deux saisies différentes ⇒ deux résultats différents", () => {
    const filtre = (valeur: string) =>
      lignesVisibles(TRAJETS, { filtres: [{ fieldId: "dest", operator: "eq", valeur }] });
    expect(ids(filtre("Bouaké"))).toBe("t1,t3");
    expect(ids(filtre("Korhogo"))).toBe("t4");
    expect(ids(filtre("Bouaké"))).not.toBe(ids(filtre("Korhogo")));
  });

  it("🟢 CONTRÔLE : un littéral seul reste BYTE-COMPATIBLE avec l'existant", () => {
    // Même sémantique que l'ancien trio filterFieldId/Operator/Value.
    expect(ids(lignesVisibles(TRAJETS, {
      filtres: [{ fieldId: "statut", operator: "neq", valeur: "annule" }],
    }))).toBe("t1,t2,t4");
  });

  it("valeur vide = filtre INACTIF, jamais un filtre sur ''", () => {
    expect(ids(lignesVisibles(TRAJETS, {
      filtres: [{ fieldId: "dest", operator: "eq", valeur: "" }],
    }))).toBe(ids(TRAJETS));
  });

  it("CONJONCTION de deux filtres pilotés", () => {
    expect(ids(lignesVisibles(TRAJETS, {
      filtres: [
        { fieldId: "dest", operator: "eq", valeur: "Bouaké" },
        { fieldId: "statut", operator: "eq", valeur: "ouvert" },
      ],
    }))).toBe("t1");
  });

  it("recherche + filtre piloté + tri composent dans l'ordre déclaré", () => {
    // « bou » ne matche que Bouaké (t1, t3) ; le filtre écarte t3 (annulé) ;
    // le tri est alors exercé sur un ensemble prouvé non trivial ci-dessous.
    expect(ids(lignesVisibles(TRAJETS, {
      rechercheChamp: "dest",
      recherche: "bou",
      filtres: [{ fieldId: "statut", operator: "eq", valeur: "ouvert" }],
      triChamp: "heure",
    }))).toBe("t1");
    // tri seul, ensemble multiple : l'ordre horaire est réel.
    expect(ids(lignesVisibles(TRAJETS, { triChamp: "heure" }))).toBe("t3,t1,t2,t4");
  });

  it("options `choice` : valeurs distinctes triées, jamais de vide", () => {
    expect(optionsDistinctes(TRAJETS, "dest")).toEqual(["Bouaké", "Korhogo", "Yamoussoukro"]);
    expect(optionsDistinctes([L("x", { dest: "" })], "dest")).toEqual([]);
  });
});

describe("E2 — le scope est RÉELLEMENT relationnel", () => {
  it("🔴 CAS-TUEUR : deux parents ⇒ deux sous-ensembles DISJOINTS", () => {
    const pour = (instanceId: string) =>
      lignesVisibles(TRAJETS, { scopeFieldId: "route", instanceId });
    expect(ids(pour("r1"))).toBe("t1,t3");
    expect(ids(pour("r2"))).toBe("t2");
    const inter = pour("r1").filter((x) => pour("r2").some((y) => y.id === x.id));
    expect(inter).toEqual([]);
  });

  it("🔴 CAS-TUEUR : changer d'instance CHANGE les lignes", () => {
    expect(ids(lignesVisibles(TRAJETS, { scopeFieldId: "route", instanceId: "r1" })))
      .not.toBe(ids(lignesVisibles(TRAJETS, { scopeFieldId: "route", instanceId: "r3" })));
  });

  it("🟢 CONTRÔLE NÉGATIF : sans scopeFieldId, la liste est GLOBALE", () => {
    expect(ids(lignesVisibles(TRAJETS, { instanceId: "r1" }))).toBe(ids(TRAJETS));
  });

  it("🔴 SANS instance courante, une liste scopée est VIDE — jamais rows[0]", () => {
    // La classe « premier enregistrement en silence » ne renaît pas ici : un
    // écran orphelin ne scope sur RIEN, il ne scope pas sur le premier parent.
    expect(lignesVisibles(TRAJETS, { scopeFieldId: "route" })).toEqual([]);
  });

  it("scope PUIS filtres : la conjonction reste dans le périmètre du parent", () => {
    expect(ids(lignesVisibles(TRAJETS, {
      scopeFieldId: "route",
      instanceId: "r1",
      filtres: [{ fieldId: "statut", operator: "eq", valeur: "ouvert" }],
    }))).toBe("t1");
  });
});
