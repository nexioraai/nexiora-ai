// GATE DES PROMESSES — PHASE 10B, critère F1.
//
// Fait fondateur (`APP-D004`) : 227 `expectedTests` étaient déclarés au corpus
// et leurs SEULS consommateurs étaient le validateur (unicité d'identifiant) et
// le rendu texte. **Personne ne les exécutait.** Mesuré à la première
// confrontation : 167 sur 227 visaient une cible qui ne fonctionne pas.
//
// Ce module confronte chaque promesse à l'état RÉEL de sa cible dans le
// document, croisé avec l'enveloppe d'exécution du moteur. Il est PUR : il
// n'exécute ni ne compile rien.
//
// 🔴 LIMITE INSCRITE DANS L'INSTRUMENT : une cible vivante n'est PAS une
// promesse tenue. Vérifier « le total additionne correctement » exigerait
// d'exécuter une logique que le moteur n'exécute pas. Cette gate établit une
// **CONDITION NÉCESSAIRE** — rien de plus, et elle le dit dans son propre
// rapport (`limites`). `P-C` : `PARTIAL → PASS` ❌.
import type { ProjectAir } from "@deribfy/air-schema";
import {
  type ExecutionEnvelope,
  controls,
  dataBindings,
  reachableScreens,
} from "@deribfy/execution-contract";

export type PromiseState =
  /** La cible existe et fonctionne. CONDITION NÉCESSAIRE satisfaite — pas la promesse. */
  | "cible_vivante"
  /** La cible existe mais ne fonctionne pas : rien ne peut tenir cette promesse. */
  | "cible_morte"
  /** La cible n'est pas déclarée par le document. */
  | "cible_inexistante";

export type TargetKind = "screen" | "action" | "entity" | "inconnu";

export interface PromiseVerdict {
  readonly testId: string;
  readonly kind: string;
  readonly targetId: string;
  readonly targetKind: TargetKind;
  readonly state: PromiseState;
  /** Pourquoi ce verdict — jamais un code nu, toujours la cause mesurée. */
  readonly motif: string;
}

export interface PromiseCoverage {
  /** Écrans atteignables couverts par ≥ 1 promesse. */
  readonly screens: readonly [covered: number, total: number];
  /** Actions réellement exécutées par le moteur, couvertes par ≥ 1 promesse. */
  readonly actions: readonly [covered: number, total: number];
  /** Entités rendues avec des données, couvertes par ≥ 1 promesse. */
  readonly entities: readonly [covered: number, total: number];
}

export interface PromiseReport {
  readonly verdicts: readonly PromiseVerdict[];
  readonly declared: number;
  readonly vivantes: number;
  readonly mortes: number;
  readonly inexistantes: number;
  /** Ce que l'artefact promet et qui n'est PAS mesuré ici. Toujours non vide. */
  readonly limites: readonly string[];
  readonly coverage: PromiseCoverage;
  readonly passed: boolean;
  /** Vide si `passed`. Sinon, une raison par cause distincte. */
  readonly failures: readonly string[];
}

const LIMITES: readonly string[] = [
  "L'ÉNONCÉ de chaque promesse n'est pas vérifié : une cible vivante n'est pas une promesse tenue.",
  "Aucune exécution n'a lieu — la mesure porte sur le document croisé avec l'enveloppe déclarée du moteur.",
  "La COUVERTURE est publiée mais ne fait pas échouer : aucun seuil n'a été arbitré.",
];

/**
 * Confronte les promesses d'un document à l'état réel de leurs cibles.
 *
 * FAIL-CLOSED sur le silence : un document qui ne déclare AUCUNE promesse
 * n'obtient pas un vert. Sans cette règle, la gate serait triviale à contourner
 * — il suffirait de ne rien promettre pour tout passer. C'est exactement le
 * défaut de « gate satisfaite par un artefact que personne n'a exploité »
 * (règle de composition 4 du GATE_REGISTER).
 */
export function evaluatePromises(
  air: ProjectAir,
  envelope: ExecutionEnvelope,
): PromiseReport {
  const atteignables = new Set(reachableScreens(air, envelope.triggers));
  const recensement = controls(air, envelope);
  const actionsVivantes = new Set(
    recensement.filter((c) => c.executed).map((c) => c.actionId),
  );
  const actionsById = new Map(air.actions.map((a) => [a.id, a]));
  const entitesRendues = new Set(
    dataBindings(air)
      .filter((b) => b.seeded)
      .map((b) => b.entityId),
  );
  const ecrans = new Set(air.screens.map((s) => s.id));
  const entites = new Set(air.entities.map((e) => e.id));

  // `expectedTests` est REQUIS par le schéma : pas de garde `?? []` — elle
  // laisserait croire que le champ peut manquer, et masquerait une régression
  // du schéma derrière un tableau vide silencieux.
  const verdicts: PromiseVerdict[] = air.expectedTests.map((t) => {
    const base = { testId: t.id, kind: t.kind, targetId: t.targetId };
    if (ecrans.has(t.targetId)) {
      return atteignables.has(t.targetId)
        ? { ...base, targetKind: "screen" as const, state: "cible_vivante" as const, motif: "écran atteignable depuis l'entrée" }
        : { ...base, targetKind: "screen" as const, state: "cible_morte" as const, motif: "écran INATTEIGNABLE : aucun chemin d'exécution n'y mène" };
    }
    const action = actionsById.get(t.targetId);
    if (action !== undefined) {
      return actionsVivantes.has(t.targetId)
        ? { ...base, targetKind: "action" as const, state: "cible_vivante" as const, motif: "action câblée sur un bloc et exécutée par le moteur" }
        : {
            ...base,
            targetKind: "action" as const,
            state: "cible_morte" as const,
            motif: `effet \`${action.effect.kind}\` / déclencheur \`${action.trigger.kind}\` HORS ENVELOPPE, ou action câblée sur aucun bloc — rien ne s'exécute`,
          };
    }
    if (entites.has(t.targetId)) {
      return entitesRendues.has(t.targetId)
        ? { ...base, targetKind: "entity" as const, state: "cible_vivante" as const, motif: "entité liée à un bloc rendu et alimentée" }
        : { ...base, targetKind: "entity" as const, state: "cible_morte" as const, motif: "entité liée à AUCUN bloc rendu, ou sans dataset — rien ne s'affiche" };
    }
    return {
      ...base,
      targetKind: "inconnu" as const,
      state: "cible_inexistante" as const,
      motif: "la cible n'est ni un écran, ni une action, ni une entité de ce document",
    };
  });

  const cibles = new Set(verdicts.map((v) => v.targetId));
  const inter = (candidats: Iterable<string>): readonly [number, number] => {
    const all = [...candidats];
    return [all.filter((id) => cibles.has(id)).length, all.length] as const;
  };

  const mortes = verdicts.filter((v) => v.state === "cible_morte").length;
  const inexistantes = verdicts.filter((v) => v.state === "cible_inexistante").length;
  const failures: string[] = [];
  if (verdicts.length === 0) {
    failures.push(
      "AUCUNE promesse déclarée : la fidélité ne peut pas être établie sur le silence — un document qui ne promet rien ne passe pas.",
    );
  }
  if (mortes > 0) failures.push(`${mortes} promesse(s) à CIBLE MORTE`);
  if (inexistantes > 0) failures.push(`${inexistantes} promesse(s) à CIBLE INEXISTANTE`);

  return {
    verdicts,
    declared: verdicts.length,
    vivantes: verdicts.filter((v) => v.state === "cible_vivante").length,
    mortes,
    inexistantes,
    limites: LIMITES,
    coverage: {
      screens: inter(atteignables),
      actions: inter(actionsVivantes),
      entities: inter(entitesRendues),
    },
    passed: failures.length === 0,
    failures,
  };
}
