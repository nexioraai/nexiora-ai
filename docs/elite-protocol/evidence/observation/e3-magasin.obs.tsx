// E3.1 (D-130) — PREUVE AU RENDU : le magasin observable fait VIVRE un écran
// RÉELLEMENT ÉMIS. L'écran `scr_departs` de l'app compilée `v3-bus-intercites`
// est monté avec le magasin ; on lui APPLIQUE des transitions déterministes et
// on regarde ce que React rend réellement — loading, nouvelles lignes SUR
// PLACE sans navigation, mutation locale, erreur qui dit la vérité.
//
// Prérequis : `npm run gate:app-compile` (comme corpus-rendu, D-074).
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP = join(tmpdir(), "deribfy-gate-compile", "v3-bus-intercites") + "/";
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

describe("E3.1 — l'écran émis VIT au rythme du magasin", () => {
  it("loading → v1 → v2 → mutation → error : chaque transition rend RÉELLEMENT", async () => {
    expect(existsSync(APP), "lancer d'abord `npm run gate:app-compile`").toBe(true);
    const { DataRoot } = await import(APP + "lib/runtime/data-provider.tsx");
    const { FormStateRoot } = await import(APP + "lib/runtime/form-state.tsx");
    const { creerMagasin } = await import(APP + "lib/runtime/magasin-donnees.ts");
    const Ecran = (await import(APP + "screens/scr_departs.tsx")).default;

    const magasin = creerMagasin({
      ent_depart: [D("d1", "Bouaké", "2026-09-03", "a_l_heure")],
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

    // v1 : la ligne seed est rendue.
    expect(rendu(r)).toContain("Bouaké");

    // A. DET-033 — une revalidation sur des lignes EXISTANTES est silencieuse :
    // l'écran continue de servir la vérité affichée, aucun « Chargement… » ne
    // vient démonter l'UI (c'est ce clignotement 30 s qui interrompait la
    // frappe sur appareil réel). Le chargement VISIBLE reste réservé au
    // premier remplissage — vérifié plus bas sur magasin vide.
    act(() => magasin.appliquerChargement("ent_depart"));
    expect(rendu(r)).toContain("Bouaké");
    expect(rendu(r)).not.toContain("Chargement des départs…");

    // B. v1 → v2 : les lignes changent SUR PLACE — aucune navigation.
    act(() =>
      magasin.appliquerDonnees("ent_depart", [
        D("d1", "Bouaké", "2026-09-03", "a_l_heure"),
        D("d2", "Korhogo", "2026-09-04", "a_l_heure"),
      ]),
    );
    const apresV2 = rendu(r);
    expect(apresV2).toContain("Bouaké");
    expect(apresV2).toContain("Korhogo");
    expect(apresV2).not.toContain("Chargement des départs…");

    // Le filtre STATIQUE du document reste souverain : un départ annulé
    // n'apparaît pas, magasin ou pas (E1 littéral intact).
    act(() =>
      magasin.appliquerDonnees("ent_depart", [
        D("d1", "Bouaké", "2026-09-03", "a_l_heure"),
        D("d2", "Korhogo", "2026-09-04", "a_l_heure"),
        D("d3", "San-Pédro", "2026-09-05", "annule"),
      ]),
    );
    expect(rendu(r)).not.toContain("San-Pédro");

    // C. MUTATION LOCALE : l'écriture re-rend sans navigation.
    act(() => {
      expect(magasin.create?.("ent_depart", D("d4", "Man", "2026-09-06", "a_l_heure").values)).toBe(true);
    });
    expect(rendu(r)).toContain("Man");

    // E. ANTI-TEMPÊTE : des données identiques ne changent RIEN au rendu.
    const avantNoop = rendu(r);
    const versionAvant = magasin.versionEntite("ent_depart");
    act(() =>
      magasin.appliquerDonnees("ent_depart", magasin.listInstances("ent_depart")),
    );
    expect(magasin.versionEntite("ent_depart")).toBe(versionAvant);
    expect(rendu(r)).toBe(avantNoop);

    // D. ERREUR : l'état dit la vérité (titre du document), le magasin
    // CONSERVE le dernier instantané — rien de périmé présenté comme frais.
    act(() => magasin.appliquerErreur("ent_depart"));
    const enErreur = rendu(r);
    expect(enErreur).toContain("Départs indisponibles");
    expect(enErreur).not.toContain("Korhogo"); // le rendu n'affiche PAS les lignes comme fraîches
    expect(magasin.listInstances("ent_depart").length).toBeGreaterThan(0); // snapshot conservé

    r?.unmount();
  });

  it("DET-033 — magasin VIDE : le premier remplissage, lui, rend bien « Chargement… »", async () => {
    expect(existsSync(APP), "lancer d'abord `npm run gate:app-compile`").toBe(true);
    const { DataRoot } = await import(APP + "lib/runtime/data-provider.tsx");
    const { FormStateRoot } = await import(APP + "lib/runtime/form-state.tsx");
    const { creerMagasin } = await import(APP + "lib/runtime/magasin-donnees.ts");
    const Ecran = (await import(APP + "screens/scr_departs.tsx")).default;

    const magasin = creerMagasin({ ent_depart: [] });
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
    act(() => magasin.appliquerChargement("ent_depart"));
    expect(rendu(r)).toContain("Chargement des départs…");
    r?.unmount();
  });
});
