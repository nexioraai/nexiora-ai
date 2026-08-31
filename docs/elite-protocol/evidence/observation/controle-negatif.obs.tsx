// INSTRUMENT D'OBSERVATION v0 — TAP + DELTA + CONTRÔLE NÉGATIF
//
// POURQUOI IL EXISTE. La mesure structurelle des 25 gates a établi que
// 0/25 gates possèdent une correspondance sémantique avec le runtime, et que
// G5 (« tout contrôle agit ») n'a AUCUNE implémentation : ce qui existait
// était un recensement statique de types. Cet instrument produit la première
// observation d'EXÉCUTION du chantier : il rend un écran ÉMIS avec le runtime
// ÉMIS, presse chaque contrôle par son identité, et enregistre le delta.
//
// CE QU'IL PROUVE : qu'un contrôle agit ou n'agit pas, sur l'artefact réel.
// CE QU'IL NE PROUVE PAS : rien de la couche native (géométrie, fluidité,
// persistance, réseau). Le rendu est celui de react-test-renderer sur un stub
// d'hôtes RN — niveau JS, pas niveau appareil.
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { DataRoot } from "../../../../slices/conteneurs/app/lib/runtime/data-provider";
import { buildDemoProvider } from "../../../../slices/conteneurs/app/lib/runtime/demo-provider";
import { demoData } from "../../../../slices/conteneurs/app/demo.data";
import Ecran from "../../../../slices/conteneurs/app/screens/scr_conteneurs";
import { journal, reset } from "./stub-navigation";

const rendre = (): ReactTestRenderer => {
  let r: ReactTestRenderer | undefined;
  act(() => { r = create(<DataRoot provider={buildDemoProvider(demoData)}><Ecran /></DataRoot>); });
  if (!r) throw new Error("rendu impossible");
  return r;
};
/** Identités réellement ADRESSABLES dans l'arbre rendu. */
const adressables = (r: ReactTestRenderer): string[] =>
  [...new Set(r.root.findAll((n) => typeof (n.props as { testID?: string }).testID === "string")
    .map((n) => (n.props as { testID: string }).testID))].sort();
/** Presse un nœud par son identité ; retourne false si aucun handler n'existe. */
const presser = (r: ReactTestRenderer, testID: string): boolean => {
  const cibles = r.root.findAll((n) => (n.props as { testID?: string }).testID === testID &&
    typeof (n.props as { onPress?: unknown }).onPress === "function");
  if (cibles.length === 0) return false;
  act(() => { (cibles[0].props as { onPress: () => void }).onPress(); });
  return true;
};

describe("INSTRUMENT D'OBSERVATION — écran émis scr_conteneurs", () => {
  it("CONTRÔLE NÉGATIF — sans appui, aucune transition ne se produit", () => {
    reset(); const r = rendre();
    act(() => {});                                   // laisser vivre le rendu
    expect(journal).toHaveLength(0);                 // 🔴 delta nul exigé
    console.log("\n[OBS] contrôle négatif : transitions sans appui =", journal.length);
    console.log("[OBS] identités adressables :", adressables(r).join(", "));
    r.unmount();
  });

  it("TAP + DELTA — chaque identité adressable est pressée, le delta est enregistré", () => {
    const r0 = rendre(); const ids = adressables(r0); r0.unmount();
    const releve: { id: string; handler: boolean; transitions: string[] }[] = [];
    for (const id of ids) {
      reset(); const r = rendre();
      const handler = presser(r, id);
      releve.push({ id, handler, transitions: journal.map((j) => j.name) });
      r.unmount();
    }
    console.log("\n[OBS] RELEVÉ D'EXÉCUTION — appui par identité");
    for (const l of releve)
      console.log(`   ${l.id.padEnd(30)} handler=${String(l.handler).padEnd(5)} transitions=[${l.transitions.join(",") || "aucune"}]`);
    const agissants = releve.filter((l) => l.transitions.length > 0);
    const inertes = releve.filter((l) => l.handler && l.transitions.length === 0);
    const sansHandler = releve.filter((l) => !l.handler);
    console.log(`\n[OBS] BILAN  adressables=${ids.length}  avec handler=${releve.length - sansHandler.length}` +
      `  AGISSANTS=${agissants.length}  pressés-SANS-EFFET=${inertes.length}  sans handler=${sansHandler.length}`);
    expect(ids.length).toBeGreaterThan(0);
  });
});
