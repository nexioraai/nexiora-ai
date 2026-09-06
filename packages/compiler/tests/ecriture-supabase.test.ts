// FALSIFICATIONS DE L'ÉCRITURE — port injecté, aucun réseau.
// La règle : l'instantané local ne doit JAMAIS refléter une écriture que le
// serveur n'a pas acceptée. Chaque test cherche à prendre le module en défaut.
import { describe, expect, it } from "vitest";
import { creerMagasin } from "../runtime/magasin-donnees.ts";
import { creerMagasinEcrivain } from "../runtime/ecriture-supabase.ts";
import type { PortEcriture, ReponseEcriture } from "../runtime/ecriture-supabase.ts";

const OK: ReponseEcriture = { error: null };
const KO: ReponseEcriture = { error: { message: "new row violates row-level security policy" } };

function port(reponse: ReponseEcriture): { p: PortEcriture; appels: string[] } {
  const appels: string[] = [];
  return {
    appels,
    p: {
      ecrire: (table, ligne) => {
        appels.push(`ecrire:${table}:${JSON.stringify(ligne)}`);
        return Promise.resolve(reponse);
      },
      supprimer: (table, id) => {
        appels.push(`supprimer:${table}:${id}`);
        return Promise.resolve(reponse);
      },
    },
  };
}

const SENSIBLES = ["fld_voyageur_mot_de_passe"];

describe("écriture — le local ne ment jamais sur ce que le serveur a accepté", () => {
  it("🟢 acceptée : la ligne part au serveur PUIS entre dans l'instantané", async () => {
    const magasin = creerMagasin({ ent_voyageur: [] });
    const { p, appels } = port(OK);
    const ecrivain = creerMagasinEcrivain({ magasin, port: p, champsSensibles: SENSIBLES });
    expect(ecrivain.upsert("ent_voyageur", "u1", { fld_voyageur_nom: "Youssouf" })).toBe(true);
    // AVANT la réponse : rien n'est encore réputé écrit.
    expect(magasin.listInstances("ent_voyageur")).toHaveLength(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(magasin.getInstance("ent_voyageur", "u1")?.values.fld_voyageur_nom).toBe("Youssouf");
    expect(appels[0]).toContain('"id":"u1"');
  });

  it("🔴 REFUSÉE par RLS : l'instantané local reste INCHANGÉ", async () => {
    const magasin = creerMagasin({ ent_voyageur: [] });
    const { p } = port(KO);
    const ecrivain = creerMagasinEcrivain({ magasin, port: p, champsSensibles: SENSIBLES });
    ecrivain.upsert("ent_voyageur", "u1", { fld_voyageur_nom: "Youssouf" });
    await Promise.resolve();
    await Promise.resolve();
    // Le piège : afficher une donnée que personne ne conserve.
    expect(magasin.listInstances("ent_voyageur")).toHaveLength(0);
  });

  it("🔴 un champ SENSIBLE ne part JAMAIS vers le serveur", async () => {
    const magasin = creerMagasin({ ent_voyageur: [] });
    const { p, appels } = port(OK);
    const ecrivain = creerMagasinEcrivain({ magasin, port: p, champsSensibles: SENSIBLES });
    ecrivain.upsert("ent_voyageur", "u1", {
      fld_voyageur_nom: "Youssouf",
      fld_voyageur_mot_de_passe: "MotDePasse2026",
    });
    await Promise.resolve();
    expect(appels[0]).not.toContain("MotDePasse2026");
    expect(appels[0]).not.toContain("mot_de_passe");
    expect(appels[0]).toContain("Youssouf");
  });

  it("🔴 `update` d'une ligne ABSENTE est refusé — c'est `upsert` qui crée", () => {
    const magasin = creerMagasin({ ent_voyageur: [] });
    const { p, appels } = port(OK);
    const ecrivain = creerMagasinEcrivain({ magasin, port: p, champsSensibles: SENSIBLES });
    expect(ecrivain.update("ent_voyageur", "fantome", { fld_voyageur_nom: "X" })).toBe(false);
    expect(appels).toEqual([]);
  });

  it("🟢 suppression acceptée retire la ligne ; refusée, elle la CONSERVE", async () => {
    const seed = { ent_voyageur: [{ id: "u1", values: { fld_voyageur_nom: "Y" } }] };
    const bon = creerMagasinEcrivain({
      magasin: creerMagasin(seed), port: port(OK).p, champsSensibles: SENSIBLES,
    });
    bon.remove("ent_voyageur", "u1");
    await Promise.resolve();
    await Promise.resolve();
    expect(bon.listInstances("ent_voyageur")).toHaveLength(0);

    const mauvais = creerMagasinEcrivain({
      magasin: creerMagasin(seed), port: port(KO).p, champsSensibles: SENSIBLES,
    });
    mauvais.remove("ent_voyageur", "u1");
    await Promise.resolve();
    await Promise.resolve();
    expect(mauvais.listInstances("ent_voyageur")).toHaveLength(1);
  });

  it("🟢 la LECTURE reste celle du magasin — le décorateur n'invente rien", () => {
    const magasin = creerMagasin({ ent_depart: [{ id: "d1", values: { x: "1" } }] });
    const ecrivain = creerMagasinEcrivain({
      magasin, port: port(OK).p, champsSensibles: SENSIBLES,
    });
    expect(ecrivain.listInstances("ent_depart")).toEqual(magasin.listInstances("ent_depart"));
    expect(ecrivain.status("ent_depart")).toBe(magasin.status("ent_depart"));
  });
});
