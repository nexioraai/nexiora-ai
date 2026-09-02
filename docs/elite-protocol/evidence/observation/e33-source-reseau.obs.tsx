// E3.3 (D-132) — PREUVE AU RENDU DU FAIT : « source distante déclarée et
// effectivement consommée selon le contrat ». L'écran RÉELLEMENT ÉMIS de la
// fixture remote est monté avec le magasin ET l'adaptateur EMBARQUÉS dans
// l'app émise ; le transport est INJECTÉ (banc déterministe — ceci ne
// prouve NI un fil Internet réel, NI du temps réel poussé : polling/refresh
// consommé selon contrat, la validation appareil reste une réserve).
//
// Prérequis : `node --experimental-strip-types e33-emettre-fixture.mjs`.
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP = join(tmpdir(), "deribfy-e33-remote") + "/";
const D = (id: string, dest: string, date: string, statut: string) => ({
  id,
  values: {
    fld_depart_destination: dest,
    fld_depart_date: date,
    fld_depart_prix: "5000",
    fld_depart_statut: statut,
    fld_depart_ville_depart: "Abidjan",
  },
});
const rendu = (r: ReactTestRenderer | undefined): string => JSON.stringify(r?.toJSON() ?? null);

describe("E3.3 — l'écran émis consomme RÉELLEMENT la source distante déclarée", () => {
  it("graine → loading → lignes DISTANTES → refresh → identiques → erreur : tout rend, tout est vrai", async () => {
    expect(existsSync(APP), "lancer d'abord e33-emettre-fixture.mjs").toBe(true);
    const { DataRoot } = await import(APP + "lib/runtime/data-provider.tsx");
    const { FormStateRoot } = await import(APP + "lib/runtime/form-state.tsx");
    const { creerMagasin } = await import(APP + "lib/runtime/magasin-donnees.ts");
    const { creerAdaptateurReseau } = await import(APP + "lib/runtime/source-reseau.ts");
    const Ecran = (await import(APP + "screens/scr_departs.tsx")).default;

    // Cible et politique EXACTEMENT comme dans l'App.tsx émis (copiées du lock).
    const CIBLE = {
      datasetId: "data_departs",
      entityId: "ent_depart",
      integrationId: "intg_cache_billets",
      url: "https://api.bus-intercites.app/air/v1/entities/ent_depart/rows",
    };
    const DOMAINES = ["api.bus-intercites.app"];
    const appels: string[] = [];
    let file: { ok: boolean; status: number; corps: unknown }[] = [];
    const transport = (url: string) => {
      appels.push(url);
      return Promise.resolve(file.shift() ?? { ok: false, status: 599, corps: null });
    };

    const magasin = creerMagasin({ ent_depart: [D("d1", "Bouaké", "2026-09-03", "a_l_heure")] });
    const adaptateur = creerAdaptateurReseau({
      magasin,
      cibles: [CIBLE],
      domainesAutorises: DOMAINES,
      transport,
    });

    let r: ReactTestRenderer | undefined;
    act(() => {
      r = create(
        createElement(
          DataRoot as never,
          { provider: magasin } as never,
          createElement(FormStateRoot as never, null as never, createElement(Ecran as never)),
        ) as never,
      );
    });
    // Amorçage : la graine locale est rendue — rien de distant n'est prétendu.
    expect(rendu(r)).toContain("Bouaké");

    // 10 · LOADING observable pendant le transport en vol (promesse tenue).
    let liberer: ((x: { ok: boolean; status: number; corps: unknown }) => void) | undefined;
    const enVol = new Promise<{ ok: boolean; status: number; corps: unknown }>((res) => {
      liberer = res;
    });
    const transportLent = (url: string) => {
      appels.push(url);
      return enVol;
    };
    const adaptateurLent = creerAdaptateurReseau({
      magasin,
      cibles: [CIBLE],
      domainesAutorises: DOMAINES,
      transport: transportLent,
    });
    let demarrage: Promise<void> | undefined;
    act(() => {
      demarrage = adaptateurLent.demarrer();
    });
    expect(rendu(r)).toContain("Chargement des départs…");
    // 3 · CONSOMMATION EFFECTIVE : ces lignes n'existent QUE chez le transport.
    await act(async () => {
      liberer?.({
        ok: true,
        status: 200,
        corps: [D("r1", "Korhogo-Distante", "2026-09-04", "a_l_heure"), D("r2", "Man-Distante", "2026-09-05", "a_l_heure")],
      });
      await demarrage;
    });
    const apresRemote = rendu(r);
    expect(apresRemote).toContain("Korhogo-Distante");
    expect(apresRemote).toContain("Man-Distante");
    expect(apresRemote).not.toContain("Bouaké"); // la graine a été REMPLACÉE, pas maquillée
    expect(apresRemote).not.toContain("Chargement des départs…");

    // 8·9 · REFRESH : identiques ⇒ rendu final BYTE-IDENTIQUE ; changées ⇒ nouveau rendu.
    file = [
      { ok: true, status: 200, corps: [D("r1", "Korhogo-Distante", "2026-09-04", "a_l_heure"), D("r2", "Man-Distante", "2026-09-05", "a_l_heure")] },
    ];
    await act(async () => adaptateur.rafraichir("ent_depart"));
    expect(rendu(r)).toBe(apresRemote);
    expect(adaptateur.journal()).toContain("donnees:ent_depart:2:identiques");
    file = [{ ok: true, status: 200, corps: [D("r3", "San-Pédro-Distante", "2026-09-06", "a_l_heure")] }];
    await act(async () => adaptateur.rafraichir("ent_depart"));
    expect(rendu(r)).toContain("San-Pédro-Distante");
    expect(rendu(r)).not.toContain("Korhogo-Distante");

    // 7 · ERREUR transport : l'écran dit la vérité, l'instantané est conservé.
    file = [{ ok: false, status: 503, corps: null }];
    await act(async () => adaptateur.rafraichir("ent_depart"));
    expect(rendu(r)).toContain("Départs indisponibles");
    expect(magasin.listInstances("ent_depart").length).toBe(1); // snapshot conservé

    // 11 · AUCUN appel hors allowlist sur TOUTE la session (transports enregistreurs).
    expect(appels.every((u) => u.startsWith("https://api.bus-intercites.app/"))).toBe(true);

    // 5 · Une cible hors politique ne REND rien de distant : refus avant transport.
    const appelsInterdits: string[] = [];
    const adaptateurInterdit = creerAdaptateurReseau({
      magasin: creerMagasin({ ent_depart: [D("d1", "Bouaké", "2026-09-03", "a_l_heure")] }),
      cibles: [{ ...CIBLE, url: "https://exfiltration.example.com/air/v1/entities/ent_depart/rows" }],
      domainesAutorises: DOMAINES,
      transport: (url: string) => {
        appelsInterdits.push(url);
        return Promise.resolve({ ok: true, status: 200, corps: [] });
      },
    });
    await adaptateurInterdit.demarrer();
    expect(appelsInterdits).toEqual([]);
    expect(adaptateurInterdit.journal()).toEqual(["refus_domaine:ent_depart:exfiltration.example.com"]);

    // 12 · La trace de l'adaptateur principal est EXACTE et déterministe.
    expect(adaptateur.journal()).toEqual([
      "chargement:ent_depart",
      "donnees:ent_depart:2:identiques",
      "chargement:ent_depart",
      "donnees:ent_depart:1:nouvelles",
      "chargement:ent_depart",
      "erreur_statut:ent_depart:503",
    ]);

    r?.unmount();
  });
});
