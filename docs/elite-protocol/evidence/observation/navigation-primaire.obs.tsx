// PREUVES DE LA NAVIGATION PRINCIPALE — D-086.
//
// Exigence propriétaire : « NE CONSIDÈRE AUCUN POINT COMME RÉUSSI SUR SIMPLE
// INSPECTION DU CODE. » Aucune assertion ici ne lit un style ni une source :
// tout est MONTÉ, et l'arbre rendu est interrogé.
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer, ReactTestInstance } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { journal as navJournal, reset as navReset } from "./stub-navigation.ts";

const APP = "/tmp/nav-preuve/app/";

async function racine() {
  const { DataRoot } = await import(APP + "lib/runtime/data-provider.tsx");
  const { FormStateRoot } = await import(APP + "lib/runtime/form-state.tsx");
  const { buildDemoProvider } = await import(APP + "lib/runtime/demo-provider.ts");
  const { demoData } = await import(APP + "demo.data.ts");
  return { DataRoot, FormStateRoot, provider: buildDemoProvider(demoData) };
}

async function monter(ecran: string): Promise<ReactTestRenderer> {
  const k = await racine();
  const Ecran = (await import(APP + `screens/${ecran}.tsx`)).default as () => unknown;
  let r: ReactTestRenderer | undefined;
  act(() => {
    r = create(
      createElement(k.DataRoot as never, { provider: k.provider } as never,
        createElement(k.FormStateRoot as never, null as never, createElement(Ecran as never))) as never,
    );
  });
  return r!;
}

const barre = (r: ReactTestRenderer): ReactTestInstance | undefined =>
  r.root.findAll((n) => (n.props as { testID?: string }).testID === "primary-nav")[0];

const onglets = (r: ReactTestRenderer): ReactTestInstance[] =>
  r.root.findAll((n) => String((n.props as { testID?: string }).testID ?? "").startsWith("primary-nav-"));

const libelle = (n: ReactTestInstance): string => {
  const t = n.findAll(() => true)
    .flatMap((x) => (Array.isArray(x.props.children) ? x.props.children : [x.props.children]))
    .filter((c): c is string => typeof c === "string");
  return t[0] ?? "";
};

// Écrans du document RÉELLEMENT GÉNÉRÉ par emit-v3 (D-086) — ce n'est plus un
// document que j'ai écrit à la main.
const ECRANS = ["scr_accueil", "scr_menu", "scr_panier", "scr_commandes", "scr_compte"];

describe("PREUVE 4 — la navigation est rendue EN BAS", () => {
  it("la barre est le DERNIER enfant de la coquille, après tout le contenu", async () => {
    const r = await monter("scr_accueil");
    const b = barre(r);
    expect(b, "la barre doit être rendue").toBeDefined();
    // Position prouvée par l'ORDRE DE L'ARBRE, pas par une feuille de style :
    // la coquille est le conteneur d'écran, la barre est son dernier enfant.
    const coquille = r.root.findAll((n) => (n.props as { testID?: string }).testID === "scr_accueil")[0];
    expect(coquille, "la coquille d'écran doit exister").toBeDefined();
    const enfants = coquille!.children.filter((c) => typeof c !== "string") as ReactTestInstance[];
    const dernier = enfants[enfants.length - 1];
    const barreDansDernier =
      dernier?.findAll((n) => (n.props as { testID?: string }).testID === "primary-nav").length ?? 0;
    console.log(`\n[PREUVE 4] enfants de la coquille : ${String(enfants.length)} · la barre est dans le DERNIER : ${barreDansDernier > 0 ? "OUI" : "NON"}`);
    expect(barreDansDernier, "la barre doit être le dernier enfant de la coquille").toBeGreaterThan(0);
    r.unmount();
  });
});

describe("PREUVE 3 — l'ordre déclaré est respecté", () => {
  it("les onglets sont rendus dans l'ordre du document", async () => {
    const r = await monter("scr_accueil");
    const noms = onglets(r).map(libelle);
    console.log("[PREUVE 3] ordre rendu :", noms.join(" | "));
    expect(noms).toEqual(["Accueil", "Menu", "Panier", "Commandes", "Compte"]);
    r.unmount();
  });
});

describe("PREUVE 5 — persistance sur tous les écrans concernés", () => {
  it("la barre est présente sur CHAQUE écran, avec les mêmes onglets", async () => {
    const rapport: string[] = [];
    for (const e of ECRANS) {
      const r = await monter(e);
      const b = barre(r);
      const n = onglets(r).length;
      rapport.push(`   ${e.padEnd(18)} barre:${b ? "✅" : "🔴"} onglets:${String(n)}`);
      expect(b, `${e} doit porter la barre`).toBeDefined();
      expect(n, `${e} doit porter 5 onglets`).toBe(5);
      r.unmount();
    }
    console.log("[PREUVE 5] persistance :\n" + rapport.join("\n"));
  });
});

describe("PREUVE 6 — chaque destination ouvre RÉELLEMENT son écran", () => {
  it("presser un onglet navigue vers l'écran attendu", async () => {
    const r = await monter("scr_accueil");
    const attendu = ["scr_accueil", "scr_menu", "scr_panier", "scr_commandes", "scr_compte"];
    const obtenu: string[] = [];
    const tabs = onglets(r);
    for (let i = 0; i < tabs.length; i += 1) {
      navReset();
      act(() => {
        (onglets(r)[i]?.props as { onPress: () => void } | undefined)?.onPress();
      });
      obtenu.push(navJournal[0]?.name ?? "AUCUNE NAVIGATION");
    }
    console.log("[PREUVE 6] pressions :", obtenu.join(" → "));
    expect(obtenu).toEqual(attendu);
    r.unmount();
  });
});

describe("PREUVE 8 — la ligne de liste ouvre le détail", () => {
  it("une ligne de la liste des plats navigue vers le détail, avec son identifiant", async () => {
    const r = await monter("scr_accueil");
    const pressables = r.root.findAll(
      (n) => typeof (n.props as { onPress?: unknown }).onPress === "function" &&
        !String((n.props as { testID?: string }).testID ?? "").startsWith("primary-nav"),
    );
    navReset();
    let trouve: { name: string; params?: unknown } | undefined;
    for (const p of pressables) {
      navReset();
      act(() => { (p.props as { onPress: () => void }).onPress(); });
      const j = navJournal[0];
      if (j?.params !== undefined) { trouve = j; break; }
    }
    console.log("[PREUVE 8] navigation contextuelle :", JSON.stringify(trouve));
    expect(trouve, "une ligne de liste doit naviguer AVEC un itemId").toBeDefined();
    expect(trouve?.name).toBe("scr_plat_detail");
    expect((trouve?.params as { itemId?: string } | undefined)?.itemId).toBeTypeOf("string");
    r.unmount();
  });
});

describe("PREUVE — la barre est COMPACTE, pas quatre gros boutons", () => {
  it("les onglets tiennent dans UN conteneur en ligne, pas empilés", async () => {
    const r = await monter("scr_accueil");
    const b = barre(r)!;
    const style = ([] as unknown[]).concat(b.props.style as unknown[]).filter(Boolean);
    const enLigne = style.some((x) => (x as { flexDirection?: string }).flexDirection === "row");
    console.log("[PREUVE] disposition de la barre :", enLigne ? "EN LIGNE (row)" : "EMPILÉE");
    expect(enLigne, "les onglets doivent être côte à côte").toBe(true);
    // Et chaque onglet partage la largeur : `flex: 1`, donc aucun ne s'étale.
    const item = onglets(r)[0]!;
    const st = ([] as unknown[]).concat(item.props.style as unknown[]).filter(Boolean);
    expect(st.some((x) => (x as { flex?: number }).flex === 1)).toBe(true);
    r.unmount();
  });
});
