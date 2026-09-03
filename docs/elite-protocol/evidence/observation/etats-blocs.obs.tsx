// ÉTATS DE BLOC — dimension C de la grille A++, jamais observée jusqu'ici.
// Confronte TROIS affirmations qui n'ont jamais été croisées :
//   1. ce que le REGISTRE DE BLOCS déclare rendable   (getBlock().states)
//   2. ce que l'ENVELOPPE concède atteignable          (reachableBlockStates)
//   3. ce que l'ARTEFACT ÉMIS rend RÉELLEMENT           (observation)
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
const REPO = new URL("../../../../", import.meta.url).pathname;
const ECRANS = import.meta.glob("../../../../slices/conteneurs/app/screens/*.tsx");
const DONNEES = import.meta.glob("../../../../slices/conteneurs/app/screens/*.data.ts");

describe("Dimension C — états de bloc réellement rendus", () => {
  it("croise registre déclaré × enveloppe concédée × artefact observé", async () => {
    const { getBlock } = await import(REPO + "packages/blocks/src/registry.ts");
    const { EXECUTION_ENVELOPE_V1: ENV } = await import(REPO + "packages/execution-contract/src/envelope.ts");
    const { DataRoot } = await import(REPO + "slices/conteneurs/app/lib/runtime/data-provider.tsx");
    const { buildDemoProvider } = await import(REPO + "slices/conteneurs/app/lib/runtime/demo-provider.ts");
    const { demoData } = await import(REPO + "slices/conteneurs/app/demo.data.ts");

    // Deux conditions de données : celle LIVRÉE, et une variante VIDE.
    const CONDITIONS: [string, unknown][] = [
      ["fixtures livrées", buildDemoProvider(demoData)],
      ["dataset vide", buildDemoProvider({})],
    ];
    const observes = new Map<string, Set<string>>();   // blockType → états vus
    const rendus = new Map<string, Set<string>>();      // condition → blocs rendus

    for (const [nomCond, provider] of CONDITIONS) {
      rendus.set(nomCond, new Set());
      for (const [chemin, charger] of Object.entries(ECRANS)) {
        const { screenData } = await (DONNEES[chemin.replace(/\.tsx$/, ".data.ts")] as
          () => Promise<{ screenData: { blocks: { id: string; blockType: string }[] } }>)();
        const Ecran = (await (charger as () => Promise<{ default: () => unknown }>)()).default;
        let r: ReactTestRenderer | undefined;
        act(() => { r = create(createElement(DataRoot as never, { provider } as never, createElement(Ecran as never)) as never); });
        for (const b of screenData.blocks) {
          const n = r!.root.findAll((x) => (x.props as { testID?: string }).testID === b.id)[0];
          if (!n) continue;
          rendus.get(nomCond)!.add(b.id);
          const st = (n.props as { state?: unknown }).state;
          const kind = typeof st === "string" ? st : (st as { kind?: string } | undefined)?.kind;
          if (kind) { if (!observes.has(b.blockType)) observes.set(b.blockType, new Set()); observes.get(b.blockType)!.add(kind); }
        }
        r!.unmount();
      }
    }

    console.log("\n[C] blocType        DÉCLARÉ au registre            CONCÉDÉ par l'enveloppe     OBSERVÉ rendu");
    const types = [...new Set([...observes.keys(), ...Object.keys(ENV.reachableBlockStates)])].sort();
    let dec = 0, con = 0, obs = 0;
    for (const t of types) {
      const d = getBlock(t)?.states ?? [], c = ENV.reachableBlockStates[t] ?? [], o = [...(observes.get(t) ?? [])].sort();
      dec += d.length; con += c.length; obs += o.length;
      console.log(`    ${t.padEnd(16)}${d.join("/").padEnd(31)}${c.join("/").padEnd(28)}${o.join("/") || "«aucun état porté»"}`);
    }
    console.log(`    ${"TOTAL".padEnd(16)}${String(dec).padEnd(31)}${String(con).padEnd(28)}${obs}`);
    console.log(`\n[C] états déclarés JAMAIS observés : ${dec - obs} sur ${dec}`);

    const livres = rendus.get("fixtures livrées")!, vides = rendus.get("dataset vide")!;
    const seulementVide = [...vides].filter((b) => !livres.has(b));
    console.log(`\n[C] blocs rendus — fixtures livrées : ${livres.size}   ·   dataset vide : ${vides.size}`);
    if (seulementVide.length)
      console.log(`[C] rendus SEULEMENT sous dataset vide : ${seulementVide.join(", ")}` +
        `\n    ⇒ rendables en principe, INATTEIGNABLES avec les données livrées (le moteur n'écrit pas)`);
    expect(types.length).toBeGreaterThan(0);
  });
});
