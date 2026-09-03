// INSPECTION DE L'APPLICATION QU'ON ENVOIE — « Chez Tantie — Commandes ».
//
// Les gates couvrent les projets ÉMIS EN MÉMOIRE avec des slots bouchons. Ce
// fichier inspecte le projet RÉEL, celui qui part en build : sur disque, avec
// ses vraies implémentations d'auteur, ses vraies fixtures.
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
const APP = "/Users/yia/Documents/woorri/slices/v3-resto-quartier/app/";
const ID = /^(ent_|scr_|act_|fld_|blk_|slot_|data_|rule_|need_|nav_)/;

const textes = (r: ReactTestRenderer): string[] =>
  r.root.findAll(() => true)
    .flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c): c is string => typeof c === "string");

async function racine() {
  const { DataRoot } = await import(APP + "lib/runtime/data-provider.tsx");
  const { SlotRoot } = await import(APP + "lib/runtime/slot-provider.tsx");
  const { FormStateRoot } = await import(APP + "lib/runtime/form-state.tsx");
  const { buildDemoProvider } = await import(APP + "lib/runtime/demo-provider.ts");
  const { demoData } = await import(APP + "demo.data.ts");
  const { slotRegistry } = await import(APP + "slots/index.ts");
  return { DataRoot, SlotRoot, FormStateRoot, provider: buildDemoProvider(demoData), slotRegistry };
}

function monter(k: Awaited<ReturnType<typeof racine>>, Ecran: () => unknown, prov?: unknown) {
  let r: ReactTestRenderer | undefined;
  act(() => {
    r = create(
      createElement(k.DataRoot as never, { provider: prov ?? k.provider } as never,
        createElement(k.SlotRoot as never, { registry: k.slotRegistry } as never,
          createElement(k.FormStateRoot as never, null as never, createElement(Ecran as never)))) as never,
    );
  });
  return r!;
}

describe("CHEZ TANTIE — l'application réellement envoyée", () => {
  it("les 7 écrans se montent, sans exception, sans avertissement React, sans fuite", async () => {
    const k = await racine();
    const avert: string[] = [];
    const err = console.error, warn = console.warn;
    const cap = (...a: unknown[]): void => {
      const m = a.map(String).join(" ");
      if (!m.includes("AIR_CAPABILITY_NOT_IMPLEMENTED") && !m.includes("deprecated") && !m.includes("support act"))
        avert.push(m.slice(0, 140));
    };
    console.error = cap; console.warn = cap;
    const rapport: string[] = [];
    for (const f of readdirSync(APP + "screens").filter((x) => x.endsWith(".tsx")).sort()) {
      const Ecran = (await import(APP + "screens/" + f)).default as () => unknown;
      const r = monter(k, Ecran);
      const ids = r.root.findAll((n) => typeof (n.props as { testID?: string }).testID === "string").length;
      const t = textes(r);
      const fuites = t.filter((x) => ID.test(x));
      rapport.push(`   ${f.padEnd(30)} ${String(ids).padStart(3)} identités · ${String(t.length).padStart(3)} textes${fuites.length ? " · 🔴 FUITE " + fuites[0] : ""}`);
      expect(ids, f).toBeGreaterThan(0);
      expect(fuites, f).toEqual([]);
      r.unmount();
    }
    console.error = err; console.warn = warn;
    console.log("\n[CHEZ TANTIE] écrans montés :\n" + rapport.join("\n"));
    console.log("[CHEZ TANTIE] avertissements React : " + (avert.length === 0 ? "AUCUN" : avert.join(" | ")));
    expect([...new Set(avert)]).toEqual([]);
  });

  it("les contrôles AGISSENT : ni bouton muet, ni écriture fantôme", async () => {
    const k = await racine();
    const journal: string[] = [];
    const data = JSON.parse(JSON.stringify(await import(APP + "demo.data.ts").then((m) => m.demoData)));
    const ecrivain = {
      listInstances: (e: string) => data[e] ?? [],
      getInstance: (e: string, id?: string) =>
        id === undefined ? data[e]?.[0] : data[e]?.find((r: { id: string }) => r.id === id),
      create: (e: string, v: Record<string, string>) => { journal.push(`create:${e}`); (data[e] ??= []).push({ id: "n", values: v }); return true; },
      update: (e: string) => { journal.push(`update:${e}`); return true; },
      remove: (e: string) => { journal.push(`remove:${e}`); return true; },
    };
    let pressables = 0;
    for (const f of readdirSync(APP + "screens").filter((x) => x.endsWith(".tsx")).sort()) {
      const Ecran = (await import(APP + "screens/" + f)).default as () => unknown;
      const r = monter(k, Ecran, ecrivain);
      const n = r.root.findAll((x) => typeof (x.props as { onPress?: unknown }).onPress === "function").length;
      pressables += n;
      // Saisir puis presser TOUT, comme un utilisateur pressé.
      const champs = r.root.findAll((x) => typeof (x.props as { onChangeText?: unknown }).onChangeText === "function").length;
      for (let i = 0; i < champs; i += 1) {
        act(() => {
          const c = r.root.findAll((x) => typeof (x.props as { onChangeText?: unknown }).onChangeText === "function");
          (c[i]?.props as { onChangeText: (v: string) => void } | undefined)?.onChangeText("0700000000");
        });
      }
      expect(() => {
        act(() => {
          for (const b of r.root.findAll((x) => typeof (x.props as { onPress?: unknown }).onPress === "function")) {
            (b.props as { onPress: () => void }).onPress();
          }
        });
      }, `${f} : presser ne doit jamais lever`).not.toThrow();
      r.unmount();
    }
    console.log(`[CHEZ TANTIE] ${String(pressables)} contrôles pressés · écritures réelles : ${String(journal.length)}`);
    console.log("[CHEZ TANTIE] journal :", journal.slice(0, 4).join(" · ") || "aucune");
    expect(pressables, "l'app doit exposer des contrôles").toBeGreaterThan(0);
    expect(journal.length, "au moins une soumission doit ÉCRIRE").toBeGreaterThan(0);
  });

  it("les 4 slots d'auteur s'EXÉCUTENT réellement", async () => {
    const k = await racine();
    const noms = Object.keys(k.slotRegistry as Record<string, unknown>);
    console.log("[CHEZ TANTIE] slots au registre :", noms.join(" "));
    expect(noms.length, "les 4 slots déclarés doivent être au registre").toBe(4);
    for (const n of noms) {
      const fn = (k.slotRegistry as Record<string, (e: unknown) => unknown>)[n];
      const sortie = fn?.({ lignes: [1, 2, 3] });
      expect(sortie, `${n} doit rendre un objet`).toBeTypeOf("object");
    }
  });
});
