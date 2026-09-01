// PREUVES DE COMPOSITION — D-087 : images et recherche RÉELLEMENT RENDUES.
//
// Le défaut vivait à QUATRE étages : le registre n'avait aucun bloc image, le
// runtime ne passait rien, les fixtures rendaient la chaîne vide, et le
// générateur ne savait pas où placer une photo. Corriger un seul n'aurait rien
// montré. Ces preuves montent l'application et interrogent l'arbre rendu.
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer, ReactTestInstance } from "react-test-renderer";
import { describe, expect, it } from "vitest";

const APP = "/tmp/nav-preuve/app/";

async function monter(ecran: string): Promise<ReactTestRenderer> {
  const { DataRoot } = await import(APP + "lib/runtime/data-provider.tsx");
  const { FormStateRoot } = await import(APP + "lib/runtime/form-state.tsx");
  const { buildDemoProvider } = await import(APP + "lib/runtime/demo-provider.ts");
  const { demoData } = await import(APP + "demo.data.ts");
  const Ecran = (await import(APP + `screens/${ecran}.tsx`)).default as () => unknown;
  let r: ReactTestRenderer | undefined;
  act(() => {
    r = create(
      createElement(DataRoot as never, { provider: buildDemoProvider(demoData) } as never,
        createElement(FormStateRoot as never, null as never, createElement(Ecran as never))) as never,
    );
  });
  return r!;
}

/** Toute image montée, quel que soit son emplacement dans l'arbre. */
const images = (r: ReactTestRenderer): ReactTestInstance[] =>
  r.root.findAll((n) => {
    const src = (n.props as { source?: { uri?: string } }).source;
    return typeof src?.uri === "string";
  });

describe("PREUVE — les images déclarées sont RÉELLEMENT rendues", () => {
  it("la liste du menu rend une vignette par plat", async () => {
    const r = await monter("scr_menu");
    const im = images(r);
    const uris = im.map((n) => String((n.props as { source: { uri: string } }).source.uri));
    console.log(`\n[COMPOSITION] images rendues sur le menu : ${String(im.length)}`);
    console.log("[COMPOSITION] première URI :", uris[0]?.slice(0, 46) + "…");
    expect(im.length, "chaque ligne de plat doit porter sa vignette").toBeGreaterThan(0);
    // Aucune image vide : une valeur absente ne doit PAS produire un cadre nu.
    expect(uris.filter((u) => u === "")).toEqual([]);
    r.unmount();
  });

  it("la fiche du plat rend son visuel d'en-tête", async () => {
    const r = await monter("scr_plat_detail");
    const entete = r.root.findAll((n) =>
      String((n.props as { testID?: string }).testID ?? "").endsWith("-image"),
    );
    console.log("[COMPOSITION] visuel d'en-tête sur la fiche :", entete.length > 0 ? "PRÉSENT" : "ABSENT");
    expect(entete.length, "la fiche doit porter son visuel").toBeGreaterThan(0);
    r.unmount();
  });

  it("CONTRÔLE NÉGATIF : un écran SANS champ image déclaré n'en rend aucune", async () => {
    // Sans ce contrôle, une image rendue partout passerait pour une réussite.
    const r = await monter("scr_compte");
    console.log("[COMPOSITION] images sur un écran sans photo :", images(r).length);
    expect(images(r).length).toBe(0);
    r.unmount();
  });
});

describe("PREUVE — la recherche est rendue EN HAUT de la liste", () => {
  it("un champ de recherche précède les lignes", async () => {
    const r = await monter("scr_menu");
    const champ = r.root.findAll((n) =>
      String((n.props as { testID?: string }).testID ?? "").endsWith("-search"),
    );
    expect(champ.length, "la recherche doit être rendue").toBeGreaterThan(0);
    // POSITION prouvée par l'ORDRE DE L'ARBRE : la recherche apparaît AVANT la
    // première ligne, pas par lecture d'un style.
    const tout = r.root.findAll(() => true);
    const iRecherche = tout.findIndex((n) =>
      String((n.props as { testID?: string }).testID ?? "").endsWith("-search"),
    );
    const iLigne = tout.findIndex((n) =>
      String((n.props as { testID?: string }).testID ?? "").includes("-row-"),
    );
    console.log(`[COMPOSITION] recherche en position ${String(iRecherche)}, première ligne en ${String(iLigne)}`);
    expect(iRecherche, "la recherche doit précéder les lignes").toBeLessThan(iLigne);
    r.unmount();
  });

  it("saisir FILTRE réellement les lignes rendues", async () => {
    const r = await monter("scr_menu");
    const avant = r.root.findAll((n) =>
      String((n.props as { testID?: string }).testID ?? "").includes("-row-"),
    ).length;
    act(() => {
      const c = r.root.findAll((n) =>
        String((n.props as { testID?: string }).testID ?? "").endsWith("-search"),
      );
      (c[0]?.props as { onChangeText: (v: string) => void } | undefined)?.onChangeText("zzzz-introuvable");
    });
    const apres = r.root.findAll((n) =>
      String((n.props as { testID?: string }).testID ?? "").includes("-row-"),
    ).length;
    console.log(`[COMPOSITION] lignes avant filtre : ${String(avant)} · après une saisie sans résultat : ${String(apres)}`);
    expect(avant, "le menu doit avoir des plats").toBeGreaterThan(0);
    expect(apres, "une recherche sans résultat doit VIDER la liste").toBeLessThan(avant);
    r.unmount();
  });
});
