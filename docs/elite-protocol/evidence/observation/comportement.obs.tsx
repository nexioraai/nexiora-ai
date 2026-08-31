// INSPECTION DE COMPORTEMENT — l'application AGIT-elle ?
//
// Monter sans exception ne prouve rien : `APP-D002` montrait 56 contrôles
// pressables et muets. Ici on PRESSE, on SAISIT, et on regarde ce qui se passe
// réellement dans la source de données.
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
const REPO = new URL("../../../../", import.meta.url).pathname;
const APP = REPO + "slices/resto-riche/app/";

interface Instance { id: string; values: Record<string, string> }

/** Fournisseur qui ÉCRIT réellement, et journalise ce qu'on lui demande. */
function providerEcrivain(base: Record<string, Instance[]>) {
  const journal: string[] = [];
  const data: Record<string, Instance[]> = JSON.parse(JSON.stringify(base)) as typeof base;
  return {
    journal,
    provider: {
      listInstances: (e: string) => data[e] ?? [],
      getInstance: (e: string, id?: string) =>
        id === undefined ? data[e]?.[0] : data[e]?.find((r) => r.id === id),
      create: (e: string, values: Readonly<Record<string, string>>) => {
        journal.push(`create:${e}:${JSON.stringify(values)}`);
        (data[e] ??= []).push({ id: `nouveau_${String((data[e]?.length ?? 0) + 1)}`, values: { ...values } });
        return true;
      },
    },
  };
}

async function monter(provider: unknown, ecran: string) {
  const { DataRoot } = await import(APP + "lib/runtime/data-provider.tsx");
  const { FormStateRoot } = await import(APP + "lib/runtime/form-state.tsx");
  const Ecran = (await import(APP + `screens/${ecran}.tsx`)).default;
  let r: ReactTestRenderer | undefined;
  act(() => {
    r = create(
      createElement(
        DataRoot as never,
        { provider } as never,
        createElement(FormStateRoot as never, null as never, createElement(Ecran as never)),
      ) as never,
    );
  });
  return r!;
}

describe("INSPECTION — l'application agit", () => {
  it("un formulaire VALIDE écrit réellement dans la source", async () => {
    const { demoData } = await import(APP + "demo.data.ts");
    const { journal, provider } = providerEcrivain(demoData as never);
    const r = await monter(provider, "scr_form");
    // Saisir chaque champ, puis soumettre — comme un utilisateur.
    // Saisir champ par champ, en RE-INTERROGEANT l'arbre : chaque frappe
    // provoque un rendu, donc les nœuds capturés avant deviennent obsolètes.
    const nbChamps = r.root.findAll(
      (n) => typeof (n.props as { onChangeText?: unknown }).onChangeText === "function",
    ).length;
    for (let i = 0; i < nbChamps; i += 1) {
      act(() => {
        const champs = r.root.findAll(
          (n) => typeof (n.props as { onChangeText?: unknown }).onChangeText === "function",
        );
        (champs[i]?.props as { onChangeText: (v: string) => void } | undefined)?.onChangeText(
          "0600000000",
        );
      });
    }
    act(() => {
      for (const b of r.root.findAll(
        (n) => typeof (n.props as { onPress?: unknown }).onPress === "function",
      )) {
        (b.props as { onPress: () => void }).onPress();
      }
    });
    r.unmount();
    console.log("\n[COMPORTEMENT] champs saisis :", nbChamps, "· écritures :", journal.length);
    console.log("[COMPORTEMENT] journal :", journal.slice(0, 2));
    expect(nbChamps, "le formulaire doit exposer ses champs").toBeGreaterThan(0);
    expect(journal.length, "la soumission doit ÉCRIRE").toBeGreaterThan(0);
  });

  it("une RÈGLE violée BLOQUE l'écriture — et n'envoie personne sur la confirmation", async () => {
    // Le document exige le téléphone (`rule_client_tel`). On soumet SANS le
    // remplir : rien ne doit être écrit. Sans cette garde, l'utilisateur verrait
    // « commande confirmée » pour une commande qui n'existe pas.
    const { demoData } = await import(APP + "demo.data.ts");
    const { journal, provider } = providerEcrivain(demoData as never);
    const r = await monter(provider, "scr_form");
    const boutons = r.root.findAll(
      (n) => typeof (n.props as { onPress?: unknown }).onPress === "function",
    );
    act(() => {
      for (const b of boutons) (b.props as { onPress: () => void }).onPress();
    });
    r.unmount();
    console.log("[COMPORTEMENT] soumission SANS téléphone → écritures :", journal.length);
    expect(journal, "la règle doit REFUSER l'écriture").toEqual([]);
  });

  it("CONTRÔLE NÉGATIF : une source en LECTURE SEULE n'écrit rien, et ne casse pas", async () => {
    const { buildDemoProvider } = await import(APP + "lib/runtime/demo-provider.ts");
    const { demoData } = await import(APP + "demo.data.ts");
    const r = await monter(buildDemoProvider(demoData), "scr_form");
    const boutons = r.root.findAll(
      (n) => typeof (n.props as { onPress?: unknown }).onPress === "function",
    );
    expect(() => {
      act(() => {
        for (const b of boutons) (b.props as { onPress: () => void }).onPress();
      });
    }, "aucune méthode d'écriture exposée : l'appel doit être ABSENT, pas fatal").not.toThrow();
    r.unmount();
  });
});
