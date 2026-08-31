// E-19 — CORRESPONDANCE RUNTIME ↔ VALIDATEUR, MESURÉE.
// Pour chaque contrôle adressable de l'artefact émis : ce que le VALIDATEUR
// prédit (recensement statique `controls()`) confronté à ce que l'EXÉCUTION
// observe (appui + delta). Aucune supposition : les deux côtés sont exécutés.
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { journal, reset } from "./stub-navigation";

const REPO = new URL("../../../../", import.meta.url).pathname;
const ECRANS = import.meta.glob("../../../../slices/conteneurs/app/screens/*.tsx");
const DONNEES = import.meta.glob("../../../../slices/conteneurs/app/screens/*.data.ts");

describe("E-19 — correspondance runtime ↔ validateur", () => {
  it("confronte le recensement statique à l'exécution, contrôle par contrôle", async () => {
    // ── CÔTÉ VALIDATEUR
    const { migrateAirDocument } = await import(REPO + "packages/air-schema/src/migrations.ts");
    const { controls } = await import(REPO + "packages/execution-contract/src/graph.ts");
    const { EXECUTION_ENVELOPE_V1 } = await import(REPO + "packages/execution-contract/src/envelope.ts");
    const air = migrateAirDocument(JSON.parse(readFileSync(REPO + "slices/conteneurs/air/suivi-conteneurs.air.json", "utf8")));
    const recensement = controls(air, EXECUTION_ENVELOPE_V1);
    const parBloc = new Map(recensement.map((c) => [c.blockId, c]));

    // ── CÔTÉ EXÉCUTION
    const { DataRoot } = await import(REPO + "slices/conteneurs/app/lib/runtime/data-provider.tsx");
    const { buildDemoProvider } = await import(REPO + "slices/conteneurs/app/lib/runtime/demo-provider.ts");
    const { demoData } = await import(REPO + "slices/conteneurs/app/demo.data.ts");
    const provider = buildDemoProvider(demoData);

    const lignes: { ecran: string; id: string; bloc: string; predit: string; observe: string; verdict: string }[] = [];
    for (const [chemin, charger] of Object.entries(ECRANS)) {
      const { screenData } = await (DONNEES[chemin.replace(/\.tsx$/, ".data.ts")] as
        () => Promise<{ screenData: { screenId: string } }>)();
      const Ecran = (await (charger as () => Promise<{ default: () => unknown }>)()).default;
      const rendre = (): ReactTestRenderer => { let r: ReactTestRenderer | undefined;
        act(() => { r = create(createElement(DataRoot as never,
          { provider } as never, createElement(Ecran as never)) as never); });
        return r!; };
      const r0 = rendre();
      const ids = [...new Set(r0.root.findAll((n) => typeof (n.props as { testID?: string }).testID === "string")
        .map((n) => (n.props as { testID: string }).testID))].sort();
      r0.unmount();
      for (const id of ids) {
        reset(); const r = rendre();
        const cible = r.root.findAll((n) => (n.props as { testID?: string }).testID === id &&
          typeof (n.props as { onPress?: unknown }).onPress === "function")[0];
        if (!cible) { r.unmount(); continue; }              // sans handler : hors périmètre E-19
        act(() => { (cible.props as { onPress: () => void }).onPress(); });
        const agit = journal.length > 0; r.unmount();
        // Le testID rendu peut porter un suffixe d'affordance (-row-N, -submit).
        // Le dépouiller est indispensable : sans quoi la jointure fabrique de faux silences.
        const bloc = /^(.*)-row-.+$/.exec(id)?.[1] ?? /^(.*)-submit$/.exec(id)?.[1] ?? id;
        const st = parBloc.get(bloc);
        const predit = st === undefined ? "NON RECENSÉ" : st.executed ? "AGIT" : "FANTÔME";
        const observe = agit ? "AGIT" : "INERTE";
        const verdict =
          predit === "AGIT" && observe === "AGIT" ? "🟢 concordant"
          : predit === "FANTÔME" && observe === "INERTE" ? "🟢 concordant"
          : predit === "NON RECENSÉ" && observe === "INERTE" ? "🔴 SILENCE DU VALIDATEUR"
          : predit === "NON RECENSÉ" && observe === "AGIT" ? "🔴 ACTION NON RECENSÉE"
          : predit === "AGIT" && observe === "INERTE" ? "🔴 FAUX POSITIF D'EXÉCUTION"
          : "🔴 FAUX FANTÔME";
        lignes.push({ ecran: screenData.screenId, id, bloc, predit, observe, verdict });
      }
    }

    // ── CLASSE SUPPLÉMENTAIRE : recensé par le validateur, JAMAIS RENDU
    const rendus = new Set(lignes.map((l) => l.bloc));
    const jamaisRendus = recensement.filter((c) => !rendus.has(c.blockId));
    console.log(`\n[E19] RECENSÉS PAR LE VALIDATEUR MAIS JAMAIS RENDUS : ${jamaisRendus.length}`);
    for (const c of jamaisRendus)
      console.log(`      🔴 ${c.screenId}/${c.blockId} (effet ${c.effectKind}) — l'utilisateur ne peut pas même le voir`);

    // ── MATRICE
    const M = new Map<string, number>();
    for (const l of lignes) M.set(`${l.predit}|${l.observe}`, (M.get(`${l.predit}|${l.observe}`) ?? 0) + 1);
    console.log("\n[E19] MATRICE DE CORRESPONDANCE — contrôles pressables du slice conteneurs");
    console.log("      prédiction du VALIDATEUR   ×   observation à l'EXÉCUTION");
    console.log("      " + "─".repeat(58));
    console.log("      prédit \\ observé".padEnd(28) + "AGIT".padStart(8) + "INERTE".padStart(10));
    for (const p of ["AGIT", "FANTÔME", "NON RECENSÉ"])
      console.log("      " + p.padEnd(28) + String(M.get(`${p}|AGIT`) ?? 0).padStart(8) + String(M.get(`${p}|INERTE`) ?? 0).padStart(10));
    const conc = lignes.filter((l) => l.verdict.startsWith("🟢")).length;
    console.log(`      ${"─".repeat(58)}`);
    console.log(`      total pressables : ${lignes.length}   concordants : ${conc}   DISCORDANTS : ${lignes.length - conc}`);
    console.log(`      taux de correspondance : ${(100 * conc / lignes.length).toFixed(1)} %`);
    const disc = lignes.filter((l) => l.verdict.startsWith("🔴"));
    const parBlocDisc = new Map<string, number>();
    for (const l of disc) parBlocDisc.set(`${l.ecran}/${l.bloc} · ${l.verdict}`, (parBlocDisc.get(`${l.ecran}/${l.bloc} · ${l.verdict}`) ?? 0) + 1);
    console.log(`\n[E19] DISCORDANCES regroupées par bloc :`);
    for (const [k, n] of [...parBlocDisc].sort((a, b) => b[1] - a[1])) console.log(`      ${String(n).padStart(2)} × ${k}`);
    expect(lignes.length).toBeGreaterThan(0);
  });
});
