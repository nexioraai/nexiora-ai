// D-060 — `loading` ET `error` SONT-ILS RÉELLEMENT ATTEINTS ?
//
// `APP-D003` : la dimension C d'A++ était déclarée conforme sur une lecture de
// SOURCE, puis requalifiée `non_conforme` quand l'instrument a mesuré
// l'ATTEIGNABILITÉ. Le registre v1 rendait la conformité IMPOSSIBLE : `form`
// ne connaissait ni `loading` ni `empty`, `detail_header` aucun état.
//
// Ce fichier ne lit aucun source. Il MONTE les blocs avec un fournisseur qui
// rapporte chaque état, et lit ce qui est rendu.
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
const REPO = new URL("../../../../", import.meta.url).pathname;
const APP = REPO + "slices/resto-riche/app/";

const textes = (r: ReactTestRenderer): string[] =>
  r.root
    .findAll(() => true)
    .flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c): c is string => typeof c === "string");

async function rendreAvecStatut(statut: "loading" | "error" | "ready"): Promise<string[]> {
  const { DataRoot } = await import(APP + "lib/runtime/data-provider.tsx");
  const { buildDemoProvider } = await import(APP + "lib/runtime/demo-provider.ts");
  const { demoData } = await import(APP + "demo.data.ts");
  const base = buildDemoProvider(demoData);
  // Fournisseur qui RAPPORTE son état — exactement ce qu'une source réelle fait.
  const provider = { ...base, status: () => statut };
  const Ecran = (await import(APP + "screens/scr_menu.tsx")).default;
  let r: ReactTestRenderer | undefined;
  act(() => {
    r = create(createElement(DataRoot as never, { provider } as never, createElement(Ecran as never)) as never);
  });
  const out = textes(r!);
  r!.unmount();
  return out;
}

describe("D-060 — atteignabilité RÉELLE des états de bloc", () => {
  it("CONTRÔLE NÉGATIF : source `ready` — ni chargement ni erreur rendus", async () => {
    const t = await rendreAvecStatut("ready");
    expect(t).not.toContain("Chargement de la carte");
    expect(t).not.toContain("Carte indisponible");
  });

  it("source `loading` → l'état LOADING est ATTEINT", async () => {
    const t = await rendreAvecStatut("loading");
    console.log("\n[D-060] rendu en chargement :", t.filter((x) => x.length < 40).slice(0, 3));
    expect(t).toContain("Chargement de la carte");
  });

  it("source `error` → l'état ERROR est ATTEINT", async () => {
    const t = await rendreAvecStatut("error");
    console.log("[D-060] rendu en erreur     :", t.filter((x) => x.length < 40).slice(0, 3));
    expect(t).toContain("Carte indisponible");
  });
});
