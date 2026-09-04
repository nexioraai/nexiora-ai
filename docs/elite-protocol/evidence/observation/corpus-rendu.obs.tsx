// GATE RACINE (2/2) — VRAIE VERSION : les 14 applications sont MONTÉES.
//
// La première version de cette gate s'appelait « se rendent » et se contentait
// de LIRE les modules de données. **Elle surdéclarait** — exactement le défaut
// qu'elle existe pour attraper. Ici, chaque écran de chaque application est
// réellement monté avec React et ses données de démonstration.
//
// Prérequis : `npm run gate:app-compile` a écrit les 14 projets sous
// `gate-compile/` (il les compile de toute façon).
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// PORTABILITÉ (D-074) : même répertoire que `gate:app-compile`, calculé et non
// codé en dur — la version précédente pointait un chemin propre à ma session.
const RACINE = join(tmpdir(), "deribfy-gate-compile") + "/";
const ID = /^(ent_|scr_|act_|fld_|blk_|slot_|data_|rule_|need_|nav_)/;

describe("GATE RACINE — les applications émises se MONTENT vraiment", () => {
  it("chaque écran de chaque application rend, sans exception ni fuite", async () => {
    expect(existsSync(RACINE), "lancer d'abord `npm run gate:app-compile`").toBe(true);
    const apps = readdirSync(RACINE).sort();
    // 26 depuis la campagne v3 (D-081) : le corpus gelé ET le corpus généré.
    // ÉDITION CONSCIENTE (2026-09-04) : 27 depuis l'entrée de `bus-intercites`
    // au corpus v3 (intention créée par arbitrage D-126, run accepté D-127).
    // Le cliquet reste EXACT — il continue d'exiger un nombre précis, donc
    // toute app ajoutée ou perdue sans décision le fait échouer. Sa réparation
    // n'assouplit rien : elle le RÉARME. Mesuré le 2026-09-04 : cette
    // assertion précède la boucle de montage, donc tant qu'elle échouait
    // AUCUN écran n'était monté — la gate ne prouvait plus rien.
    expect(apps.length, "les applications des deux corpus").toBe(27);

    let ecrans = 0;
    let identites = 0;
    const problemes: string[] = [];

    // AVERTISSEMENTS REACT (D-076) — la première version de cette gate ne
    // regardait que les EXCEPTIONS. Or la CI a révélé « Encountered two children
    // with the same key `` », que React qualifie lui-même de « comportement non
    // supporté ». Un avertissement React est un DÉFAUT, pas du bruit : il est
    // désormais capturé et fait échouer.
    // `AIR_CAPABILITY_NOT_IMPLEMENTED` est EXCLU : ce n'est pas un défaut, c'est
    // le fournisseur par défaut qui REFUSE ET TRACE, exactement comme conçu.
    const reactWarnings: string[] = [];
    const vraiError = console.error;
    const vraiWarn = console.warn;
    const capturer = (...args: unknown[]): void => {
      const m = args.map((a) => String(a)).join(" ");
      if (
        !m.includes("AIR_CAPABILITY_NOT_IMPLEMENTED") &&
        !m.includes("react-test-renderer is deprecated") &&
        !m.includes("not configured to support act")
      ) {
        reactWarnings.push(m.slice(0, 160));
      }
    };
    console.error = capturer;
    console.warn = capturer;

    for (const app of apps) {
      const base = RACINE + app + "/";
      const { DataRoot } = await import(base + "lib/runtime/data-provider.tsx");
      const { FormStateRoot } = await import(base + "lib/runtime/form-state.tsx");
      const { buildDemoProvider } = await import(base + "lib/runtime/demo-provider.ts");
      const { demoData } = await import(base + "demo.data.ts");
      const provider = buildDemoProvider(demoData);

      for (const f of readdirSync(base + "screens").filter((x) => x.endsWith(".tsx")).sort()) {
        ecrans += 1;
        const Ecran = (await import(base + "screens/" + f)).default as () => unknown;
        let r: ReactTestRenderer | undefined;
        try {
          act(() => {
            r = create(
              createElement(
                DataRoot as never,
                { provider } as never,
                createElement(FormStateRoot as never, null as never, createElement(Ecran as never)),
              ) as never,
            );
          });
        } catch (e) {
          problemes.push(`${app}/${f} — EXCEPTION : ${e instanceof Error ? e.message : String(e)}`);
          continue;
        }
        const ids = r!.root.findAll(
          (n) => typeof (n.props as { testID?: string }).testID === "string",
        ).length;
        if (ids === 0) problemes.push(`${app}/${f} — AUCUNE identité adressable`);
        // D-083 : PRESSER, pas seulement monter. Un écran peut se rendre
        // parfaitement et n'avoir que des boutons muets — c'était `APP-D002`, et
        // c'est ce qui a failli partir en build : les mutations étaient câblées
        // sur des BOUTONS, qui n'avaient accès à aucune valeur saisie.
        try {
          act(() => {
            for (const b of r!.root.findAll(
              (n) => typeof (n.props as { onPress?: unknown }).onPress === "function",
            )) {
              (b.props as { onPress: () => void }).onPress();
            }
          });
        } catch (e) {
          problemes.push(`${app}/${f} — PRESSION FATALE : ${e instanceof Error ? e.message : String(e)}`);
        }
        identites += ids;
        const textes = r!.root
          .findAll(() => true)
          .flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
          .filter((c): c is string => typeof c === "string");
        for (const t of textes) {
          if (ID.test(t)) problemes.push(`${app}/${f} — FUITE d'identifiant : ${t}`);
        }
        r!.unmount();
      }
    }

    console.error = vraiError;
    console.warn = vraiWarn;
    for (const w of [...new Set(reactWarnings)]) problemes.push(`AVERTISSEMENT REACT : ${w}`);

    console.log(
      `\n[GATE RENDU] ${String(apps.length)} applications · ${String(ecrans)} écrans montés · ` +
        `${String(identites)} identités adressables · ${String(problemes.length)} problème(s)`,
    );
    for (const p of problemes.slice(0, 10)) console.log("   🔴 " + p);
    expect(problemes).toEqual([]);
    expect(ecrans, "au moins 150 écrans sur les deux corpus").toBeGreaterThan(150);
  });
});
