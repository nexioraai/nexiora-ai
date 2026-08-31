// INSTRUMENT D'OBSERVATION v1 — COUVERTURE DES DEUX SLICES.
// Étend v0 : tous les écrans émis des 2 slices · appui par identité ·
// contrôle négatif par écran · ET comparaison OBSERVÉ vs PLAN.
// Ce que le plan attend est lu dans les données d'écran ÉMISES, jamais supposé.
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { journal, reset } from "./stub-navigation";

const ECRANS = import.meta.glob("../../../../slices/*/app/screens/*.tsx");
const DONNEES = import.meta.glob("../../../../slices/*/app/screens/*.data.ts");
const PROVIDERS = import.meta.glob("../../../../slices/*/app/lib/runtime/data-provider.tsx");
const DEMOPROV = import.meta.glob("../../../../slices/*/app/lib/runtime/demo-provider.ts");
const DEMODATA = import.meta.glob("../../../../slices/*/app/demo.data.ts");
const slice = (p: string): string => p.split("/slices/")[1].split("/")[0];

interface Donnees { screenId: string; blocks: { id: string; blockType: string; props: Record<string, unknown> }[];
  actions: Record<string, { kind: string; screenId?: string }>; uiActionsByBlock: Record<string, string>; }

/** Cible ATTENDUE par le plan pour une identité pressée — lue dans les données émises. */
function cibleAttendue(d: Donnees, testID: string): string | null {
  const row = /^(.*)-row-.+$/.exec(testID);
  const blockId = row ? row[1] : testID;
  const bloc = d.blocks.find((b) => b.id === blockId);
  if (!bloc) return null;
  const parProp = typeof bloc.props.actionId === "string" ? bloc.props.actionId : undefined;
  const parDeclencheur = d.uiActionsByBlock[blockId];
  const actionId = ["button", "empty_state"].includes(bloc.blockType) ? parProp : parDeclencheur;
  if (!actionId) return null;
  const eff = d.actions[actionId];
  return eff?.kind === "navigate" && eff.screenId ? eff.screenId : null;
}

describe("INSTRUMENT v1 — couverture des écrans émis des 2 slices", () => {
  it("presse toutes les identités de tous les écrans et confronte au plan", async () => {
    const bilan: Record<string, { ids: number; handlers: number; conformes: number; inertes: number;
      divergents: number; nonDeclarees: number; sansAttente: number }> = {};
    const anomalies: string[] = [];

    for (const [cheminEcran, charger] of Object.entries(ECRANS)) {
      const s = slice(cheminEcran);
      try {
      const nomData = cheminEcran.replace(/\.tsx$/, ".data.ts");
      const modData = await (DONNEES[nomData] as () => Promise<{ screenData: Donnees }>)();
      const d = modData.screenData;
      const { DataRoot } = await (Object.entries(PROVIDERS).find(([k]) => slice(k) === s)![1] as
        () => Promise<{ DataRoot: (p: unknown) => unknown }>)();
      const { buildDemoProvider } = await (Object.entries(DEMOPROV).find(([k]) => slice(k) === s)![1] as
        () => Promise<{ buildDemoProvider: (d: unknown) => unknown }>)();
      const { demoData } = await (Object.entries(DEMODATA).find(([k]) => slice(k) === s)![1] as
        () => Promise<{ demoData: unknown }>)();
      const Ecran = (await (charger as () => Promise<{ default: () => unknown }>)()).default;

      if (typeof Ecran !== "function") throw new Error(`écran non chargé : ${cheminEcran}`);
      const rendre = (): ReactTestRenderer => { let r: ReactTestRenderer | undefined;
        // createElement, jamais un appel direct : les hooks exigent un vrai rendu.
        const arbre = createElement(DataRoot as never, { provider: buildDemoProvider(demoData) } as never,
          createElement(Ecran as never));
        act(() => { r = create(arbre as never); });
        if (!r) throw new Error("rendu impossible"); return r; };

      reset(); const r0 = rendre();
      if (journal.length !== 0) anomalies.push(`${s}/${d.screenId} : CONTRÔLE NÉGATIF ÉCHOUÉ (${journal.length})`);
      const ids = [...new Set(r0.root.findAll((n) => typeof (n.props as { testID?: string }).testID === "string")
        .map((n) => (n.props as { testID: string }).testID))].sort();
      r0.unmount();

      const b = bilan[`${s}/${d.screenId}`] = { ids: ids.length, handlers: 0, conformes: 0, inertes: 0,
        divergents: 0, nonDeclarees: 0, sansAttente: 0 };
      for (const id of ids) {
        reset(); const r = rendre();
        const cibles = r.root.findAll((n) => (n.props as { testID?: string }).testID === id &&
          typeof (n.props as { onPress?: unknown }).onPress === "function");
        if (cibles.length === 0) { r.unmount(); continue; }
        b.handlers++;
        act(() => { (cibles[0].props as { onPress: () => void }).onPress(); });
        const obs = journal.map((j) => j.name); r.unmount();
        const att = cibleAttendue(d, id);
        if (att && obs.length === 1 && obs[0] === att) b.conformes++;
        else if (att && obs.length === 0) { b.inertes++; anomalies.push(`🔴 ${s}/${d.screenId}/${id} : plan=${att}, observé=AUCUNE`); }
        else if (att && obs[0] !== att) { b.divergents++; anomalies.push(`🔴 ${s}/${d.screenId}/${id} : plan=${att}, observé=${obs.join(",")}`); }
        else if (!att && obs.length > 0) { b.nonDeclarees++; anomalies.push(`🔴 ${s}/${d.screenId}/${id} : plan=AUCUNE, observé=${obs.join(",")}`); }
        else { b.sansAttente++; anomalies.push(`🟠 ${s}/${d.screenId}/${id} : PRESSABLE SANS EFFET (aucune action au plan)`); }
      }
      } catch (e) {
        // Un écran qui ne se rend pas EST une observation : on l'enregistre, on continue.
        anomalies.push(`🔴 ${cheminEcran.split("/app/")[1]} : RENDU IMPOSSIBLE — ${String((e as Error).message).slice(0, 90)}`);
      }
    }

    console.log("\n[OBS] COUVERTURE — écran par écran");
    console.log("  écran".padEnd(34) + "ids  handler  conforme  inerte  diverg.  non-décl.  pressable-sans-effet");
    const T = { ids: 0, handlers: 0, conformes: 0, inertes: 0, divergents: 0, nonDeclarees: 0, sansAttente: 0 };
    for (const [k, b] of Object.entries(bilan)) {
      for (const c of Object.keys(T) as (keyof typeof T)[]) T[c] += b[c];
      console.log(`  ${k.padEnd(32)}${String(b.ids).padStart(3)}${String(b.handlers).padStart(9)}` +
        `${String(b.conformes).padStart(10)}${String(b.inertes).padStart(8)}${String(b.divergents).padStart(9)}` +
        `${String(b.nonDeclarees).padStart(11)}${String(b.sansAttente).padStart(22)}`);
    }
    console.log(`  ${"TOTAL".padEnd(32)}${String(T.ids).padStart(3)}${String(T.handlers).padStart(9)}` +
      `${String(T.conformes).padStart(10)}${String(T.inertes).padStart(8)}${String(T.divergents).padStart(9)}` +
      `${String(T.nonDeclarees).padStart(11)}${String(T.sansAttente).padStart(22)}`);
    console.log(`\n[OBS] ANOMALIES : ${anomalies.length}`);
    anomalies.forEach((a) => console.log("   " + a));
    expect(T.ids).toBeGreaterThan(0);
  });
});
