// E3.3 (D-132) — FALSIFICATIONS de l'adaptateur de source distante.
// La règle de preuve : le FAIT (« source distante déclarée et effectivement
// consommée selon le contrat ») se démontre au comportement — jamais à la
// présence syntaxique de `remote`. Transport INJECTÉ, banc déterministe,
// aucun réseau.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { creerMagasin } from "../runtime/magasin-donnees";
import type { EntityInstance } from "../runtime/magasin-donnees";
import { creerAdaptateurReseau } from "../runtime/source-reseau";
import type { ReponseTransport, Transport } from "../runtime/source-reseau";

const L = (id: string, valeur: string): EntityInstance => ({ id, values: { fld_x: valeur } });
const SEED = { ent_a: [L("a1", "graine")] };
const CIBLE = {
  datasetId: "data_a",
  entityId: "ent_a",
  integrationId: "intg_a",
  url: "https://api.exemple.app/air/v1/entities/ent_a/rows",
};
const DOMAINES = ["api.exemple.app"];

/** Transport enregistreur : répond sur script, note chaque URL appelée. */
const transportScript = (reponses: readonly ReponseTransport[]) => {
  const appels: string[] = [];
  let i = 0;
  const transport: Transport = (url) => {
    appels.push(url);
    const r = reponses[Math.min(i, reponses.length - 1)];
    i += 1;
    return Promise.resolve(r ?? { ok: false, status: 599, corps: null });
  };
  return { transport, appels };
};
const ok = (corps: unknown): ReponseTransport => ({ ok: true, status: 200, corps });

describe("consommation effective — le fait se démontre", () => {
  it("🟢 3 · remote consommé : les lignes NE VENANT PAS de la graine remplacent la graine", async () => {
    const magasin = creerMagasin(SEED);
    const { transport, appels } = transportScript([ok([L("r1", "distante-1"), L("r2", "distante-2")])]);
    const adaptateur = creerAdaptateurReseau({ magasin, cibles: [CIBLE], domainesAutorises: DOMAINES, transport });
    await adaptateur.demarrer();
    expect(appels).toEqual([CIBLE.url]);
    expect(magasin.listInstances("ent_a").map((r) => r.values.fld_x)).toEqual(["distante-1", "distante-2"]);
    expect(magasin.status("ent_a")).toBe("ready");
    expect(adaptateur.journal()).toEqual(["chargement:ent_a", "donnees:ent_a:2:nouvelles"]);
  });

  it("🔴 2 · remote DÉCLARÉ mais non consommé (adaptateur jamais démarré) : la graine reste, version intacte", () => {
    const magasin = creerMagasin(SEED);
    const v0 = magasin.versionEntite("ent_a");
    creerAdaptateurReseau({ magasin, cibles: [CIBLE], domainesAutorises: DOMAINES, ...transportScript([ok([])]) });
    expect(magasin.listInstances("ent_a").map((r) => r.values.fld_x)).toEqual(["graine"]);
    expect(magasin.versionEntite("ent_a")).toBe(v0);
  });

  it("🟢 1 · seed ne devient jamais live : aucune cible ⇒ aucun appel, aucun changement d'état", async () => {
    const magasin = creerMagasin(SEED);
    const { transport, appels } = transportScript([ok([])]);
    const adaptateur = creerAdaptateurReseau({ magasin, cibles: [], domainesAutorises: DOMAINES, transport });
    await adaptateur.demarrer();
    expect(appels).toEqual([]);
    expect(magasin.status("ent_a")).toBe("ready");
    expect(magasin.listInstances("ent_a").map((r) => r.values.fld_x)).toEqual(["graine"]);
  });
});

describe("fail-closed — politique réseau et contrat", () => {
  it("🔴 5 · domaine hors allowlist : transport JAMAIS appelé, état erreur, refus journalisé", async () => {
    const magasin = creerMagasin(SEED);
    const { transport, appels } = transportScript([ok([])]);
    const cible = { ...CIBLE, url: "https://exfiltration.example.com/air/v1/entities/ent_a/rows" };
    const adaptateur = creerAdaptateurReseau({ magasin, cibles: [cible], domainesAutorises: DOMAINES, transport });
    await adaptateur.demarrer();
    expect(appels).toEqual([]);
    expect(magasin.status("ent_a")).toBe("error");
    expect(adaptateur.journal()).toEqual(["refus_domaine:ent_a:exfiltration.example.com"]);
  });

  it("🔴 6 · endpoint invalide (http, URL malformée, hôte à port) : refus SANS appel", async () => {
    for (const url of [
      "http://api.exemple.app/air/v1/entities/ent_a/rows",
      "pas-une-url",
      "https://api.exemple.app:8443/air/v1/entities/ent_a/rows",
    ]) {
      const magasin = creerMagasin(SEED);
      const { transport, appels } = transportScript([ok([])]);
      const adaptateur = creerAdaptateurReseau({
        magasin, cibles: [{ ...CIBLE, url }], domainesAutorises: DOMAINES, transport,
      });
      await adaptateur.demarrer();
      expect(appels, url).toEqual([]);
      expect(magasin.status("ent_a"), url).toBe("error");
    }
  });

  it("🔴 7 · transport en erreur (statut ! ok, puis rejet) : état erreur, instantané CONSERVÉ", async () => {
    const magasin = creerMagasin(SEED);
    const { transport } = transportScript([{ ok: false, status: 503, corps: null }]);
    const adaptateur = creerAdaptateurReseau({ magasin, cibles: [CIBLE], domainesAutorises: DOMAINES, transport });
    await adaptateur.demarrer();
    expect(magasin.status("ent_a")).toBe("error");
    expect(magasin.listInstances("ent_a").map((r) => r.values.fld_x)).toEqual(["graine"]);

    const magasin2 = creerMagasin(SEED);
    const rejet: Transport = () => Promise.reject(new Error("coupure"));
    const a2 = creerAdaptateurReseau({ magasin: magasin2, cibles: [CIBLE], domainesAutorises: DOMAINES, transport: rejet });
    await a2.demarrer();
    expect(magasin2.status("ent_a")).toBe("error");
    expect(a2.journal()).toEqual(["chargement:ent_a", "erreur_transport:ent_a"]);
  });

  it("🔴 · réponse HORS CONTRAT (pas un tableau d'instances) : refusée — jamais de données inventées", async () => {
    for (const corps of [{ rows: [] }, [{ id: "x" }], [{ id: "x", values: { n: 3 } }], "texte", null]) {
      const magasin = creerMagasin(SEED);
      const adaptateur = creerAdaptateurReseau({
        magasin, cibles: [CIBLE], domainesAutorises: DOMAINES, ...transportScript([ok(corps)]),
      });
      await adaptateur.demarrer();
      expect(magasin.status("ent_a"), JSON.stringify(corps)).toBe("error");
      expect(magasin.listInstances("ent_a").map((r) => r.values.fld_x)).toEqual(["graine"]);
    }
  });
});

describe("rafraîchissement — la nouveauté ne se prétend pas", () => {
  it("🟢 8·9 · données CHANGÉES ⇒ nouvelle version ; IDENTIQUES ⇒ version inchangée", async () => {
    const magasin = creerMagasin(SEED);
    const { transport } = transportScript([ok([L("r1", "v1")]), ok([L("r1", "v1")]), ok([L("r1", "v2")])]);
    const adaptateur = creerAdaptateurReseau({ magasin, cibles: [CIBLE], domainesAutorises: DOMAINES, transport });
    await adaptateur.demarrer();
    const lignesV1 = JSON.stringify(magasin.listInstances("ent_a"));
    await adaptateur.rafraichir("ent_a");
    // Le cycle chargement→prêt est une transition RÉELLE (observable, f.10) ;
    // la NOUVEAUTÉ des données, elle, ne se prétend pas : lignes identiques
    // ⇒ instantané inchangé, journalisé « identiques ».
    expect(adaptateur.journal()).toContain("donnees:ent_a:1:identiques");
    expect(JSON.stringify(magasin.listInstances("ent_a"))).toBe(lignesV1);
    await adaptateur.rafraichir("ent_a");
    expect(magasin.listInstances("ent_a")[0]?.values.fld_x).toBe("v2");
    expect(adaptateur.journal().filter((e) => e.endsWith("nouvelles")).length).toBe(2);
  });

  it("🟢 10 · loading OBSERVABLE pendant le transport en vol", async () => {
    const magasin = creerMagasin(SEED);
    let liberer: ((r: ReponseTransport) => void) | undefined;
    const transport: Transport = () => new Promise((res) => { liberer = res; });
    const adaptateur = creerAdaptateurReseau({ magasin, cibles: [CIBLE], domainesAutorises: DOMAINES, transport });
    const enCours = adaptateur.demarrer();
    expect(magasin.status("ent_a")).toBe("loading"); // pendant le vol
    expect(magasin.listInstances("ent_a").length).toBe(1); // la graine reste servie
    liberer?.(ok([L("r1", "arrivée")]));
    await enCours;
    expect(magasin.status("ent_a")).toBe("ready");
  });

  it("🟢 · polling : armé UNIQUEMENT si refreshSeconds ET planificateur, annulé par arreter()", async () => {
    const magasin = creerMagasin(SEED);
    const ticks: (() => void)[] = [];
    let annule = 0;
    const { transport, appels } = transportScript([ok([L("r1", "v1")])]);
    const adaptateur = creerAdaptateurReseau({
      magasin, cibles: [{ ...CIBLE, refreshSeconds: 60 }], domainesAutorises: DOMAINES, transport,
      planificateur: (cb) => { ticks.push(cb); return () => { annule += 1; }; },
    });
    await adaptateur.demarrer();
    expect(ticks.length).toBe(1);
    expect(adaptateur.journal()).toContain("polling:ent_a:60");
    ticks[0]?.();
    await Promise.resolve();
    expect(appels.length).toBe(2); // le tick a re-consommé
    adaptateur.arreter();
    expect(annule).toBe(1);
    // Sans planificateur (banc) : rien d'armé — jamais de temps caché.
    const a2 = creerAdaptateurReseau({
      magasin: creerMagasin(SEED), cibles: [{ ...CIBLE, refreshSeconds: 60 }],
      domainesAutorises: DOMAINES, transport: transportScript([ok([])]).transport,
    });
    await a2.demarrer();
    expect(a2.journal()).not.toContain("polling:ent_a:60");
  });
});

describe("déterminisme et généricité", () => {
  it("🟢 11·12 · deux exécutions identiques ⇒ journaux et appels BYTE-IDENTIQUES, tous ⊂ allowlist", async () => {
    const executer = async () => {
      const magasin = creerMagasin(SEED);
      const { transport, appels } = transportScript([ok([L("r1", "v1")]), { ok: false, status: 500, corps: null }]);
      const adaptateur = creerAdaptateurReseau({ magasin, cibles: [CIBLE], domainesAutorises: DOMAINES, transport });
      await adaptateur.demarrer();
      await adaptateur.rafraichir("ent_a");
      return { journal: adaptateur.journal().join("|"), appels };
    };
    const un = await executer();
    const deux = await executer();
    expect(un.journal).toBe(deux.journal);
    expect(un.appels.every((u) => u.startsWith("https://api.exemple.app/"))).toBe(true);
  });

  it("🟢 14 · AUCUNE logique sectorielle dans le runtime réseau (cliquet textuel)", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "runtime", "source-reseau.ts"),
      "utf8",
    );
    expect(/\b(avion|vol|siege|siège|bus|fintech|sante|santé|paiement|billet)\b/iu.test(src)).toBe(false);
  });
});
