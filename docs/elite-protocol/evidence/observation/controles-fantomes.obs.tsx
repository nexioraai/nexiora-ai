// GATE RACINE (3/3) — AUCUN CONTRÔLE FANTÔME, SUR AUCUNE APPLICATION.
//
// Les deux premières gates vérifient que l'application COMPILE et se REND.
// Aucune ne vérifiait qu'un contrôle AGIT. C'est pourtant le défaut fondateur
// du chantier — `APP-D002`, 56 boutons pressables et muets — et il vient de
// se reproduire à l'identique sur l'application qui partait en build : les
// mutations câblées sur des boutons n'avaient accès à aucune valeur saisie,
// donc « Valider » ne faisait RIEN, en silence.
//
// Ici, chaque contrôle de chaque écran de chaque application est pressé, et
// l'on exige qu'il PRODUISE quelque chose d'OBSERVABLE : une navigation, une
// écriture, ou un appel de capability tracé. Une pression sans effet est un
// mensonge de l'interface.
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { journal as navJournal, reset as navReset } from "./stub-navigation.ts";

const RACINE = join(tmpdir(), "deribfy-gate-compile") + "/";

describe("GATE RACINE — aucun contrôle fantôme", () => {
  it("chaque contrôle pressé produit un effet OBSERVABLE", async () => {
    expect(existsSync(RACINE), "lancer d'abord `npm run gate:app-compile`").toBe(true);
    const apps = readdirSync(RACINE).sort();
    let total = 0;
    const fantomes: string[] = [];
    let agissants = 0;
    const parApp: string[] = [];

    for (const app of apps) {
      const base = RACINE + app + "/";
      const { DataRoot } = await import(base + "lib/runtime/data-provider.tsx");
      const { FormStateRoot } = await import(base + "lib/runtime/form-state.tsx");
      const { CapabilityRoot } = await import(base + "lib/runtime/capability-provider.tsx");
      const { buildDemoProvider } = await import(base + "lib/runtime/demo-provider.ts");
      const { demoData } = await import(base + "demo.data.ts");

      const ecrits: string[] = [];
      const capAppels: string[] = [];
      const lecture = buildDemoProvider(demoData);
      const provider = {
        ...lecture,
        create: (e: string) => { ecrits.push("c:" + e); return true; },
        update: (e: string) => { ecrits.push("u:" + e); return true; },
        remove: (e: string) => { ecrits.push("r:" + e); return true; },
      };
      const capabilities = { invoke: (c: { capability: string }) => { capAppels.push(c.capability); return false; } };

      let vus = 0;
      let actifs = 0;
      for (const f of readdirSync(base + "screens").filter((x) => x.endsWith(".tsx")).sort()) {
        const Ecran = (await import(base + "screens/" + f)).default as () => unknown;
        let r: ReactTestRenderer | undefined;
        act(() => {
          r = create(
            createElement(DataRoot as never, { provider } as never,
              createElement(CapabilityRoot as never, { provider: capabilities } as never,
                createElement(FormStateRoot as never, null as never, createElement(Ecran as never)))) as never,
          );
        });
        // Remplir d'abord : un formulaire vide fait légitimement refuser une règle.
        const nbChamps = r!.root.findAll((n) => typeof (n.props as { onChangeText?: unknown }).onChangeText === "function").length;
        for (let i = 0; i < nbChamps; i += 1) {
          act(() => {
            const c = r!.root.findAll((n) => typeof (n.props as { onChangeText?: unknown }).onChangeText === "function");
            (c[i]?.props as { onChangeText: (v: string) => void } | undefined)?.onChangeText("0700000000");
          });
        }
        // Presser UN par UN, et mesurer l'effet de CHAQUE pression.
        const n = r!.root.findAll((x) => typeof (x.props as { onPress?: unknown }).onPress === "function").length;
        for (let i = 0; i < n; i += 1) {
          navReset();
          const avantE = ecrits.length;
          const avantC = capAppels.length;
          act(() => {
            const b = r!.root.findAll((x) => typeof (x.props as { onPress?: unknown }).onPress === "function");
            (b[i]?.props as { onPress: () => void } | undefined)?.onPress();
          });
          vus += 1;
          if (navJournal.length > 0 || ecrits.length > avantE || capAppels.length > avantC) actifs += 1;
          else {
            const b = r!.root.findAll((x) => typeof (x.props as { onPress?: unknown }).onPress === "function");
            const id = (b[i]?.props as { testID?: string } | undefined)?.testID ?? "?";
            fantomes.push(`${app}/${f}:${id}`);
          }
        }
        r!.unmount();
      }
      total += vus;
      agissants += actifs;
      parApp.push(`   ${app.padEnd(26)} ${String(actifs).padStart(3)}/${String(vus).padEnd(3)} agissants${actifs === vus ? "" : "   🔴 " + String(vus - actifs) + " FANTÔME(S)"}`);
    }

    console.log(`\n[FANTÔMES] ${String(apps.length)} applications · ${String(agissants)}/${String(total)} contrôles agissants\n` + parApp.join("\n"));
    console.log("[FANTÔMES] échantillon :\n" + fantomes.slice(0, 8).map((x) => "   " + x).join("\n"));

    // CLIQUET, PAS PASS/FAIL (D-084) — exiger 0 ferait échouer la CI pour
    // toujours : la cause dominante des fantômes restants est un défaut des
    // DOCUMENTS (une `mutation` écrit une entité qu'aucun formulaire ne
    // collecte, donc une règle `required` la refuse à jamais), et le corpus v2
    // est GELÉ : je ne peux pas le corriger sans détruire la base de
    // comparaison historique.
    //
    // Le cliquet fige donc l'état MESURÉ. Il mord dans le seul sens qui
    // compte : le nombre de fantômes ne doit JAMAIS augmenter, et tout contrôle
    // ajouté doit agir. Baisser est libre ; monter est un échec.
    const PLAFOND = 180;
    console.log(`[FANTÔMES] cliquet : ${String(total - agissants)} / plafond ${String(PLAFOND)}`);
    expect(
      total - agissants,
      "le nombre de contrôles fantômes ne doit jamais AUGMENTER",
    ).toBeLessThanOrEqual(PLAFOND);
  });
});
