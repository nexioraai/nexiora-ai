// G2 — « ∀ contrôle adressable ». Propriété jusqu'ici NON IMPLÉMENTÉE
// (aucun croisement arbre a11y ↔ plan dans le dépôt). Mesurée ici par
// confrontation : blocs DÉCLARÉS au plan  ×  identités RÉELLEMENT rendues.
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
const REPO = new URL("../../../../", import.meta.url).pathname;
const ECRANS = import.meta.glob("../../../../slices/conteneurs/app/screens/*.tsx");
const DONNEES = import.meta.glob("../../../../slices/conteneurs/app/screens/*.data.ts");

describe("G2 — adressabilité des blocs déclarés", () => {
  it("confronte les blocs du plan aux identités réellement rendues", async () => {
    const { DataRoot } = await import(REPO + "slices/conteneurs/app/lib/runtime/data-provider.tsx");
    const { buildDemoProvider } = await import(REPO + "slices/conteneurs/app/lib/runtime/demo-provider.ts");
    const { demoData } = await import(REPO + "slices/conteneurs/app/demo.data.ts");
    const provider = buildDemoProvider(demoData);
    let declares = 0, adressables = 0; const absents: string[] = [];
    console.log("\n[G2] écran                        blocs déclarés   adressables   NON ADRESSABLES");
    for (const [chemin, charger] of Object.entries(ECRANS)) {
      const { screenData } = await (DONNEES[chemin.replace(/\.tsx$/, ".data.ts")] as
        () => Promise<{ screenData: { screenId: string; blocks: { id: string; blockType: string }[] } }>)();
      const Ecran = (await (charger as () => Promise<{ default: () => unknown }>)()).default;
      let r: ReactTestRenderer | undefined;
      act(() => { r = create(createElement(DataRoot as never, { provider } as never, createElement(Ecran as never)) as never); });
      const ids = new Set(r!.root.findAll((n) => typeof (n.props as { testID?: string }).testID === "string")
        .map((n) => (n.props as { testID: string }).testID));
      r!.unmount();
      const manquants = screenData.blocks.filter((b) => !ids.has(b.id));
      declares += screenData.blocks.length; adressables += screenData.blocks.length - manquants.length;
      manquants.forEach((b) => absents.push(`${screenData.screenId}/${b.id} [${b.blockType}]`));
      console.log(`     ${screenData.screenId.padEnd(28)}${String(screenData.blocks.length).padStart(8)}` +
        `${String(screenData.blocks.length - manquants.length).padStart(14)}${String(manquants.length).padStart(17)}`);
    }
    console.log(`     ${"TOTAL".padEnd(28)}${String(declares).padStart(8)}${String(adressables).padStart(14)}${String(declares - adressables).padStart(17)}`);
    console.log(`\n[G2] taux d'adressabilité : ${(100 * adressables / declares).toFixed(1)} %`);
    if (absents.length) { console.log("[G2] BLOCS DÉCLARÉS NON ADRESSABLES :"); absents.forEach((a) => console.log("     🔴 " + a)); }
    expect(declares).toBeGreaterThan(0);
  });
});
