// GATE DE COUVERTURE DEMANDE → AIR — PHASE 10B, critère F4.
//
// Fait fondateur (`APP-D004`) : *« menu avec photos »* est entré dans un prompt
// et a disparu — dans 12 documents sur 13, sans une trace. Non pas parce que
// personne ne regardait, mais parce que **le manque était structurellement
// indicible** : `expectedTests.targetId` doit désigner un nœud EXISTANT, donc un
// besoin sans nœud ne pouvait pas être exprimé.
//
// `intent.needs[].resolution` referme cette issue. Un besoin est soit rattaché à
// des nœuds, soit déclaré inexprimable AVEC MOTIF. L'absence silencieuse n'est
// plus une option offerte par le contrat.
//
// 🔴 RÉSIDU DÉCLARÉ, non couvert par cet instrument : un besoin que l'émetteur
// n'a JAMAIS ÉNUMÉRÉ reste invisible ici. C'est pourquoi `intent.request`
// conserve la demande VERBATIM — le matériau du contrôle qui manque encore.
import type { ProjectAir } from "@deribfy/air-schema";
import {
  type ExecutionEnvelope,
  controls,
  dataBindings,
  reachableScreens,
} from "@deribfy/execution-contract";

export type NeedState =
  /** Rattaché à des nœuds qui existent ET qui fonctionnent. */
  | "satisfait"
  /** Rattaché à des nœuds qui existent mais NE FONCTIONNENT PAS. */
  | "satisfait_par_du_mort"
  /** Rattaché à des nœuds qui n'existent pas dans le document. */
  | "reference_brisee"
  /** Déclaré hors de portée du moteur, avec motif. HONNÊTE — ne fait pas échouer. */
  | "inexprimable";

export interface NeedVerdict {
  readonly needId: string;
  readonly statement: string;
  readonly state: NeedState;
  readonly motif: string;
}

export interface IntentReport {
  /** Le document conserve-t-il seulement la demande qui l'a produit ? */
  readonly present: boolean;
  readonly verdicts: readonly NeedVerdict[];
  readonly satisfaits: number;
  readonly inexprimables: number;
  readonly defaillants: number;
  readonly limites: readonly string[];
  readonly passed: boolean;
  readonly failures: readonly string[];
}

const LIMITES: readonly string[] = [
  "Un besoin JAMAIS ÉNUMÉRÉ par l'émetteur reste invisible : cet instrument lit `needs`, il ne relit pas `request`.",
  "Un nœud « vivant » signifie atteignable / exécuté / alimenté — pas que son comportement soit correct.",
  "Le MOTIF d'un besoin inexprimable n'est pas jugé : sa présence est exigée, sa pertinence ne l'est pas.",
];

/**
 * Confronte chaque besoin déclaré à l'état réel des nœuds censés le porter.
 *
 * FAIL-CLOSED sur l'absence : un document sans `intent` ne peut pas être
 * certifié fidèle, puisque rien ne dit à quoi le comparer. C'est le FAIT sur la
 * totalité du corpus historique — et la migration 1.1.0 → 1.2.0 s'interdit
 * d'inventer une intention pour le masquer.
 */
export function evaluateIntentCoverage(
  air: ProjectAir,
  envelope: ExecutionEnvelope,
): IntentReport {
  if (air.intent === undefined) {
    return {
      present: false,
      verdicts: [],
      satisfaits: 0,
      inexprimables: 0,
      defaillants: 0,
      limites: LIMITES,
      passed: false,
      failures: [
        "AUCUNE INTENTION CONSERVÉE : le document ne porte pas la demande qui l'a produit — la fidélité n'a aucun référent.",
      ],
    };
  }

  // INCOHÉRENCE CORRIGÉE (D-079) — `promises.ts` savait qu'un slot LIÉ est
  // vivant (il est invoqué au rendu, pas par le dispatcher, donc `controls()`
  // ne le voit pas). Ce fichier ne le savait PAS : il déclarait morts les cinq
  // slots correctement liés du premier document généré. Deux gates du même
  // chantier qui ne partagent pas la même définition de « vivant » finissent
  // par se contredire — c'est arrivé.
  const vivants = new Set<string>([
    ...reachableScreens(air, envelope.triggers),
    ...controls(air, envelope).filter((c) => c.executed).map((c) => c.actionId),
    ...air.actions
      .filter((a) => a.effect.kind === "slot" && a.effect.binding !== undefined)
      .map((a) => a.id),
    ...dataBindings(air).filter((b) => b.seeded).map((b) => b.entityId),
  ]);
  // TOUS LES NŒUDS IDENTIFIÉS (D-079) — la première version n'énumérait que
  // écrans, blocs, actions, entités et champs. Elle déclarait donc « nœud
  // ABSENT » des datasets, slots, règles, routes, intégrations et tests qui
  // existaient bel et bien : **7 besoins sur 10 accusés à tort** sur le premier
  // document généré. C'est la même faute que je traque partout — un instrument
  // qui mesure moins que ce qu'il affirme. La liste est désormais celle du
  // VALIDATEUR, qui construit déjà l'ensemble complet pour l'unicité.
  const existants = new Set<string>([
    air.projectId,
    ...air.screens.flatMap((s) => [s.id, ...s.blocks.map((b) => b.id)]),
    ...air.navigation.routes.map((r) => r.id),
    ...air.entities.flatMap((e) => [e.id, ...e.fields.map((f) => f.id)]),
    ...air.relations.map((r) => r.id),
    ...air.datasets.map((d) => d.id),
    ...air.actions.map((a) => a.id),
    ...air.rules.map((r) => r.id),
    ...air.slots.map((s) => s.id),
    ...air.integrations.map((i) => i.id),
    ...air.expectedTests.map((t) => t.id),
  ]);

  const verdicts: NeedVerdict[] = air.intent.needs.map((need) => {
    const base = { needId: need.id, statement: need.statement };
    if (need.resolution.kind === "unexpressible") {
      return {
        ...base,
        state: "inexprimable" as const,
        motif: `déclaré hors de portée : ${need.resolution.reason}`,
      };
    }
    const brisees = need.resolution.nodeIds.filter((id) => !existants.has(id));
    if (brisees.length > 0) {
      return {
        ...base,
        state: "reference_brisee" as const,
        motif: `rattaché à des nœuds ABSENTS du document : ${brisees.join(", ")}`,
      };
    }
    // Les blocs et les champs n'ont pas de vie propre : ils vivent par l'écran
    // ou l'entité qui les porte, déjà mesurés. Seuls les nœuds dont la mort est
    // OBSERVABLE sont exigés vivants — sinon la gate refuserait pour une
    // propriété qu'elle ne sait pas mesurer.
    const mesurables = need.resolution.nodeIds.filter(
      (id) => id.startsWith("scr_") || id.startsWith("act_") || id.startsWith("ent_"),
    );
    const morts = mesurables.filter((id) => !vivants.has(id));
    if (morts.length > 0) {
      return {
        ...base,
        state: "satisfait_par_du_mort" as const,
        motif: `rattaché à des nœuds qui NE FONCTIONNENT PAS : ${morts.join(", ")}`,
      };
    }
    return {
      ...base,
      state: "satisfait" as const,
      motif: `porté par ${need.resolution.nodeIds.length} nœud(s) vivant(s)`,
    };
  });

  const brisees = verdicts.filter((v) => v.state === "reference_brisee").length;
  const morts = verdicts.filter((v) => v.state === "satisfait_par_du_mort").length;
  const failures: string[] = [];
  if (brisees > 0) failures.push(`${brisees} besoin(s) rattaché(s) à des nœuds INEXISTANTS`);
  if (morts > 0) failures.push(`${morts} besoin(s) rattaché(s) à des nœuds MORTS`);

  return {
    present: true,
    verdicts,
    satisfaits: verdicts.filter((v) => v.state === "satisfait").length,
    inexprimables: verdicts.filter((v) => v.state === "inexprimable").length,
    defaillants: brisees + morts,
    limites: LIMITES,
    passed: failures.length === 0,
    failures,
  };
}
