// D-064 — LA RÉFÉRENCE EST-ELLE RÉSOLUE, OU AFFICHÉE EN BRUT ?
//
// `relationTraversal: false` signifiait qu'un champ `reference` s'affichait en
// IDENTIFIANT : « ent_plat_003 » au lieu de « Thiéboudienne ». Mesuré : 6
// occurrences au corpus gelé.
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
const REPO = new URL("../../../../", import.meta.url).pathname;
const APP = REPO + "slices/resto-riche/app/";

describe("D-064 — traversée de relation au rendu", () => {
  it("le panier affiche le NOM du plat, pas son identifiant", async () => {
    const { DataRoot } = await import(APP + "lib/runtime/data-provider.tsx");
    const { buildDemoProvider } = await import(APP + "lib/runtime/demo-provider.ts");
    const { demoData } = await import(APP + "demo.data.ts");
    const provider = buildDemoProvider(demoData);
    const Ecran = (await import(APP + "screens/scr_panier.tsx")).default;
    let r: ReactTestRenderer | undefined;
    act(() => {
      r = create(createElement(DataRoot as never, { provider } as never, createElement(Ecran as never)) as never);
    });
    const textes = r!.root
      .findAll(() => true)
      .flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
      .filter((c): c is string => typeof c === "string");
    r!.unmount();

    // Les noms de plats viennent de l'entité CIBLE, résolus par la traversée.
    const noms = (demoData as Record<string, { values: Record<string, string> }[]>).ent_plat.map(
      (p) => p.values.fld_plat_nom,
    );
    const affiches = textes.filter((t) => noms.includes(t));
    console.log("\n[D-064] noms de plats résolus dans le panier :", affiches.slice(0, 3));
    expect(affiches.length, "au moins une ligne doit montrer le NOM du plat").toBeGreaterThan(0);
    // CONTRÔLE : aucun identifiant d'entité ne fuit à l'écran.
    expect(textes.filter((t) => /^ent_plat/.test(t))).toEqual([]);
  });
});
