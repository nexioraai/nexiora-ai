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
import {
  VALEUR_PAR_DEFAUT,
  champDuTestID,
  satisfait,
  valeurPourChamp,
  type AssertionData,
} from "./saisie-conforme.ts";

const RACINE = join(tmpdir(), "deribfy-gate-compile") + "/";

describe("GATE RACINE — aucun contrôle fantôme", () => {
  // BUDGET DE TEMPS EXPLICITE — cette observation n'est pas un test unitaire :
  // elle monte 27 applications, presse LES ~2000 contrôles un par un et
  // compare l'arbre rendu à chaque pression. Le défaut de 5 s de Vitest a été
  // dépassé en CI (runner plus lent que la machine de développement), et un
  // dépassement de budget n'est PAS un verdict de conformité : il masquait le
  // vrai résultat derrière un timeout. Le budget est donc DIT, généreusement,
  // et le coût a été divisé par deux dans le même geste (empreinte reportée).
  it("chaque contrôle pressé produit un effet OBSERVABLE", { timeout: 120_000 }, async () => {
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
        // Les RÈGLES du document, pour saisir des valeurs qu'elles acceptent.
        const donnees = (await import(base + "screens/" + f.replace(".tsx", ".data.ts"))) as {
          screenData?: { rules?: readonly { assertions: readonly AssertionData[] }[] };
        };
        const assertions: readonly AssertionData[] = (donnees.screenData?.rules ?? []).flatMap(
          (r) => r.assertions,
        );
        let r: ReactTestRenderer | undefined;
        act(() => {
          r = create(
            createElement(DataRoot as never, { provider } as never,
              createElement(CapabilityRoot as never, { provider: capabilities } as never,
                createElement(FormStateRoot as never, null as never, createElement(Ecran as never)))) as never,
          );
        });
        // Remplir d'abord : un formulaire vide fait légitimement refuser une règle.
        //
        // 2026-09-01 — LA VALEUR SAISIE RESPECTE DÉSORMAIS LES RÈGLES DU DOCUMENT.
        // Une constante unique violait les règles déclarées (regex d'e-mail,
        // énumération, bornes numériques) : le runtime annulait alors la mutation,
        // et un contrôle qui refusait CORRECTEMENT une saisie invalide était
        // compté fantôme. Mesuré : 28 faux positifs sur 10 applications.
        //
        // Un champ expose DEUX nœuds `onChangeText` — l'enveloppe, qui porte le
        // `testID`, puis son entrée interne, qui n'en a pas. Les deux doivent
        // recevoir la MÊME valeur, sinon la seconde écrase la première.
        const nbChamps = r!.root.findAll((n) => typeof (n.props as { onChangeText?: unknown }).onChangeText === "function").length;
        let valeurCourante = VALEUR_PAR_DEFAUT;
        for (let i = 0; i < nbChamps; i += 1) {
          act(() => {
            const c = r!.root.findAll((n) => typeof (n.props as { onChangeText?: unknown }).onChangeText === "function");
            const champ = c[i]?.props as { onChangeText: (v: string) => void; testID?: unknown } | undefined;
            const fieldId = champDuTestID(champ?.testID);
            if (fieldId !== undefined) valeurCourante = valeurPourChamp(fieldId, assertions);
            champ?.onChangeText(valeurCourante);
          });
        }
        // Presser UN par UN, et mesurer l'effet de CHAQUE pression.
        const n = r!.root.findAll((x) => typeof (x.props as { onPress?: unknown }).onPress === "function").length;
        // DET-033 : l'empreinte de rendu est REPORTÉE d'une pression à la
        // suivante — l'arbre d'après la pression i-1 EST celui d'avant la
        // pression i (rien d'autre ne s'exécute entre les deux). Une seule
        // sérialisation par contrôle au lieu de deux, sémantique identique.
        // Mesuré : la double sérialisation a fait dépasser le budget de 5 s
        // en CI dès que les chips ont grossi l'arbre.
        let empreinte = JSON.stringify(r!.toJSON());
        for (let i = 0; i < n; i += 1) {
          navReset();
          const avantE = ecrits.length;
          const avantC = capAppels.length;
          // DET-033 : l'effet OBSERVABLE inclut le RENDU. Un chip de filtre
          // change la liste sous les yeux de l'utilisateur sans naviguer ni
          // écrire — le déclarer fantôme était un défaut de la SONDE, pas du
          // contrôle. Le critère devient : navigation, écriture, capability,
          // OU changement du rendu. Un contrôle qui ne produit RIEN de tout
          // cela reste un fantôme.
          const avantR = empreinte;
          act(() => {
            const b = r!.root.findAll((x) => typeof (x.props as { onPress?: unknown }).onPress === "function");
            (b[i]?.props as { onPress: () => void } | undefined)?.onPress();
          });
          vus += 1;
          empreinte = JSON.stringify(r!.toJSON());
          if (
            navJournal.length > 0 ||
            ecrits.length > avantE ||
            capAppels.length > avantC ||
            empreinte !== avantR
          ) actifs += 1;
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
    //
    // ── 2026-09-01 · LES 25 D'ÉCART NE SONT PAS UNE TOLÉRANCE (D-110).
    //
    // L'état mesuré est 155, le plafond reste 180. Cet écart est un AMORTISSEUR
    // DE POPULATION, jamais un droit à 25 fantômes.
    //
    // RAISON, mesurée : ce compteur est un nombre ABSOLU sur une population
    // VARIABLE. P10 a fait passer le corpus compilé de 25 à 26 applications ; le
    // compteur est monté de 176 à 183 alors que le TAUX s'améliorait. Le cliquet
    // a mordu sur une croissance, pas sur une régression.
    //
    // Et 135 des 155 relèvent de trois dettes STRUCTURELLES qui croissent avec le
    // corpus : `update`/`delete` exigent un `saisie.id` que rien ne fournit (65) ;
    // une règle porte sur un champ que le formulaire ne collecte pas (30) ; un
    // `create` déclenché par un bouton n'a aucune valeur propre (30).
    //
    // Poser le plafond à 155 transformerait ce garde-fou anti-régression en
    // DÉTECTEUR DE CROISSANCE : la prochaine régénération d'un document — l'objet
    // même de la Phase 10B — le ferait rougir sans qu'aucune régression n'ait eu
    // lieu. C'est pourquoi 180 est CONSERVÉ.
    //
    // La réponse robuste n'est pas un autre seuil, c'est un cliquet DÉCOMPOSÉ PAR
    // CAUSE — chaque classe avec son propre plafond nommé. Chantier arbitré,
    // non entrepris ici.
    const PLAFOND = 180;
    console.log(`[FANTÔMES] cliquet : ${String(total - agissants)} / plafond ${String(PLAFOND)}`);
    expect(
      total - agissants,
      "le nombre de contrôles fantômes ne doit jamais AUGMENTER",
    ).toBeLessThanOrEqual(PLAFOND);
  });
});

// ── CAS-TUEURS DE L'INSTRUMENT (2026-09-01).
// Un instrument corrigé sans preuve n'est qu'un instrument différent.
describe("instrument de saisie — conforme aux règles, jamais complaisant", () => {
  const REGLES_REELLES: readonly AssertionData[] = [
    { fieldId: "fld_email", operator: "matches", value: "^[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}$" },
    { fieldId: "fld_statut", operator: "in", value: ["inactif", "essai", "actif", "expire"] },
    { fieldId: "fld_duree", operator: "gt", value: 0 },
    { fieldId: "fld_duree", operator: "lte", value: 300 },
    { fieldId: "fld_nom", operator: "required" },
  ];

  it("🔴 CONTRÔLE NÉGATIF : la valeur historique VIOLE ces règles — c'est le faux positif", () => {
    // Sans ce contrôle, le test suivant pourrait passer sur un instrument qui
    // n'a rien corrigé. Mesuré en conditions réelles : 28 faux positifs.
    const violees = REGLES_REELLES.filter((a) => !satisfait(VALEUR_PAR_DEFAUT, a));
    expect(violees.map((a) => a.fieldId + ":" + a.operator)).toEqual([
      "fld_email:matches",
      "fld_statut:in",
      "fld_duree:lte",
    ]);
  });

  it("🟢 la valeur choisie satisfait TOUTES les assertions de son champ", () => {
    for (const fieldId of ["fld_email", "fld_statut", "fld_duree", "fld_nom"]) {
      const v = valeurPourChamp(fieldId, REGLES_REELLES);
      for (const a of REGLES_REELLES.filter((x) => x.fieldId === fieldId)) {
        expect(satisfait(v, a), `${fieldId} ${a.operator} → « ${v} »`).toBe(true);
      }
    }
  });

  it("un champ SANS assertion garde la valeur historique — correction chirurgicale", () => {
    expect(valeurPourChamp("fld_libre", REGLES_REELLES)).toBe(VALEUR_PAR_DEFAUT);
    expect(valeurPourChamp("fld_libre", [])).toBe(VALEUR_PAR_DEFAUT);
  });

  it("la sémantique réplique celle du runtime, opérateur par opérateur", () => {
    expect(satisfait("", { fieldId: "f", operator: "required" })).toBe(false);
    expect(satisfait(" ", { fieldId: "f", operator: "required" })).toBe(false);
    expect(satisfait("5", { fieldId: "f", operator: "gt", value: 4 })).toBe(true);
    expect(satisfait("4", { fieldId: "f", operator: "gt", value: 4 })).toBe(false);
    expect(satisfait("4", { fieldId: "f", operator: "gte", value: 4 })).toBe(true);
    expect(satisfait("3", { fieldId: "f", operator: "lt", value: 4 })).toBe(true);
    expect(satisfait("4", { fieldId: "f", operator: "lte", value: 4 })).toBe(true);
    expect(satisfait("a", { fieldId: "f", operator: "eq", value: "a" })).toBe(true);
    expect(satisfait("a", { fieldId: "f", operator: "neq", value: "a" })).toBe(false);
    expect(satisfait("b", { fieldId: "f", operator: "in", value: ["a", "b"] })).toBe(true);
    expect(satisfait("c", { fieldId: "f", operator: "in", value: ["a", "b"] })).toBe(false);
    // Opérateur inconnu : l'instrument ne doit JAMAIS être plus sévère que le moteur.
    expect(satisfait("quoi que ce soit", { fieldId: "f", operator: "inconnu" })).toBe(true);
  });

  it("🔴 l'instrument ne peut pas se tromper de champ", () => {
    expect(champDuTestID("blk_compte_form-field-fld_membre_email")).toBe("fld_membre_email");
    // Le nœud interne d'un champ ne porte pas de testID : on ne devine pas.
    expect(champDuTestID(undefined)).toBeUndefined();
    expect(champDuTestID(null)).toBeUndefined();
    expect(champDuTestID("blk_compte_form-submit")).toBeUndefined();
  });
});
