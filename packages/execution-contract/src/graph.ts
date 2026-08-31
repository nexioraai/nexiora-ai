// GRAPHE D'APPLICATION — propriétés GLOBALES de l'AIR (Étape 1).
//
// POURQUOI CE MODULE EXISTE.
// L'émetteur raisonne écran par écran (`buildScreenSlice` construit une
// tranche locale). Or les défauts mesurés sont tous GLOBAUX : un écran n'est
// mort que relativement à l'ensemble des actions ; un écran de détail n'a de
// source d'`itemId` que si une liste d'un AUTRE écran y mène. Un compilateur
// local ne peut structurellement pas les voir. Mesuré sur 13 documents /
// 50 écrans : 17 écrans sans chemin de navigation (34 %), 15 écrans de détail
// sur 17 sans source d'identifiant.
//
// Ce module ne réifie PAS un graphe d'objets : l'instrument
// `benchmarks/composition/` a démontré que ces propriétés se calculent
// directement sur le document. Ce qui manquait n'était pas une structure de
// données, c'était un STATUT — le calcul vivait dans un banc qui ne bloquait
// rien. Il devient ici une fonction pure, testée, consommable par l'Oracle.
//
// DEUX ATTEIGNABILITÉS, JAMAIS CONFONDUES :
//  - DÉCLARÉE  : sous un moteur qui exécuterait tous les déclencheurs —
//                mesure la qualité du DOCUMENT ;
//  - EFFECTIVE : sous l'enveloppe réelle du moteur — mesure ce que
//                l'utilisateur peut réellement atteindre.
// Leur écart isole exactement ce qui relève du document de ce qui relève du
// moteur. Les confondre serait imputer au document un défaut du moteur.

import type { ProjectAir } from "@deribfy/air-schema";
import type { ExecutionEnvelope, TriggerKind } from "./envelope.ts";

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

type Air = ProjectAir;
type Screen = Air["screens"][number];
type Block = Screen["blocks"][number];
type Action = Air["actions"][number];

const propOf = (block: Block, key: string): unknown =>
  (block.props ?? []).find((p) => p.key === key)?.value;

/** Actions déclenchées par un bloc : trigger `ui` ciblé, ou prop `actionId`. */
function actionsOfBlock(air: Air, block: Block): readonly Action[] {
  const out: Action[] = [];
  const direct = propOf(block, "actionId");
  for (const action of air.actions) {
    if (action.trigger.kind === "ui" && action.trigger.blockId === block.id) out.push(action);
    else if (typeof direct === "string" && action.id === direct) out.push(action);
  }
  return out.sort((a, b) => byCodeUnit(a.id, b.id));
}

/** Écran portant un bloc donné (les ids de blocs sont uniques — validateur §1). */
function screenOfBlock(air: Air, blockId: string): Screen | undefined {
  return air.screens.find((s) => s.blocks.some((b) => b.id === blockId));
}

/**
 * Fermeture transitive des écrans atteignables depuis l'écran d'entrée.
 *
 * `allowedTriggers` borne les déclencheurs pris en compte : passer
 * l'ensemble complet donne l'atteignabilité DÉCLARÉE, passer l'enveloppe
 * donne l'atteignabilité EFFECTIVE.
 */
export function reachableScreens(
  air: Air,
  allowedTriggers: readonly TriggerKind[],
): readonly string[] {
  const allowed = new Set<TriggerKind>(allowedTriggers);
  const screenIds = new Set(air.screens.map((s) => s.id));
  const reached = new Set<string>();
  if (screenIds.has(air.navigation.entryScreenId)) reached.add(air.navigation.entryScreenId);

  let grew = true;
  while (grew) {
    grew = false;
    for (const action of air.actions) {
      // D-070 : une `mutation` peut mener a un ecran une fois l'ecriture
      // reussie. Ignorer ce chemin declarerait `scr_confirmation` MORT alors
      // que l'utilisateur y arrive — l'inverse exact du defaut que la mesure
      // d'atteignabilite existe pour trouver.
      const target =
        action.effect.kind === "navigate"
          ? action.effect.screenId
          : action.effect.kind === "mutation"
            ? action.effect.thenScreenId
            : undefined;
      if (target === undefined) continue;
      if (!allowed.has(action.trigger.kind)) continue;
      if (reached.has(target) || !screenIds.has(target)) continue;

      // L'origine doit elle-même être atteignable, sinon l'action ne peut
      // jamais être déclenchée — un chemin partant d'un écran mort est mort.
      const origin =
        action.trigger.kind === "ui"
          ? screenOfBlock(air, action.trigger.blockId)?.id
          : action.trigger.kind === "lifecycle"
            ? action.trigger.screenId
            : undefined;
      // `data` (et `lifecycle` sans screenId) sont globaux : leur origine
      // n'est pas un écran, ils sont donc déclenchables dès l'app vivante.
      const originReachable = origin === undefined || reached.has(origin);
      if (!originReachable) continue;

      reached.add(target);
      grew = true;
    }
  }
  return [...reached].sort(byCodeUnit);
}

export interface DetailScreenFinding {
  readonly screenId: string;
  readonly blockId: string;
  /** Une action `ui` portée par un bloc `list` mène-t-elle à cet écran ? */
  readonly hasItemIdSource: boolean;
}

/**
 * Écrans de détail (`detail_header`) et présence d'une source d'`itemId`.
 *
 * Sans source, `getInstance(entityId, undefined)` retombe sur la PREMIÈRE
 * ligne (repli déterministe du provider de démo) : l'écran affiche donc
 * toujours le même enregistrement, en silence. Mesuré : 15 écrans de détail
 * sur 17 sont dans ce cas sur le corpus.
 */
export function detailScreens(air: Air): readonly DetailScreenFinding[] {
  const listBlockIds = new Set(
    air.screens.flatMap((s) => s.blocks.filter((b) => b.blockType === "list").map((b) => b.id)),
  );
  const fromList = new Set(
    air.actions
      .filter(
        (a) =>
          a.effect.kind === "navigate" &&
          a.trigger.kind === "ui" &&
          listBlockIds.has(a.trigger.blockId),
      )
      .map((a) => (a.effect.kind === "navigate" ? a.effect.screenId : "")),
  );
  return air.screens
    .flatMap((s) =>
      s.blocks
        .filter((b) => b.blockType === "detail_header")
        .map((b) => ({ screenId: s.id, blockId: b.id, hasItemIdSource: fromList.has(s.id) })),
    )
    .sort((a, b) => byCodeUnit(a.blockId, b.blockId));
}

export interface DataBindingFinding {
  readonly screenId: string;
  readonly blockId: string;
  readonly blockType: string;
  readonly entityId: string;
  /** L'entité liée porte-t-elle au moins un `dataset` ? */
  readonly seeded: boolean;
  readonly rowCount: number;
}

/**
 * Blocs liés à une entité, et disponibilité RÉELLE de données.
 *
 * Un bloc `list` lié à une entité sans `dataset` affiche son état vide POUR
 * TOUJOURS, quel que soit le backend — la preview ne consommant que les
 * fixtures (D-013/D-030). Mesuré : 11 entités sur 36 (31 %) sans dataset,
 * 8 blocs `list` concernés.
 */
export function dataBindings(air: Air): readonly DataBindingFinding[] {
  const rows = new Map<string, number>();
  for (const dataset of air.datasets) {
    rows.set(dataset.entityId, (rows.get(dataset.entityId) ?? 0) + dataset.rowCount);
  }
  return air.screens
    .flatMap((s) =>
      s.blocks
        .filter((b): b is Block & { entityId: string } => b.entityId !== undefined)
        .map((b) => {
          const rowCount = rows.get(b.entityId) ?? 0;
          return {
            screenId: s.id,
            blockId: b.id,
            blockType: b.blockType,
            entityId: b.entityId,
            seeded: rowCount > 0,
            rowCount,
          };
        }),
    )
    .sort((a, b) => byCodeUnit(a.blockId, b.blockId));
}

export interface ControlFinding {
  readonly screenId: string;
  readonly blockId: string;
  readonly blockType: string;
  readonly actionId: string;
  readonly effectKind: string;
  /** L'effet est-il dans l'enveloppe du moteur ? */
  readonly executed: boolean;
}

/**
 * Contrôles VISIBLES et exécutabilité de leur action.
 *
 * Un contrôle visible dont l'effet est hors enveloppe est un CONTRÔLE
 * FANTÔME : l'utilisateur le voit, le presse, et rien ne se produit — sans
 * message, sans état, sans trace. C'est la métrique la plus discriminante du
 * critère « application correctement générée », et elle se calcule sur le
 * document seul, sans exécution.
 */
export function controls(air: Air, envelope: ExecutionEnvelope): readonly ControlFinding[] {
  const executable = new Set<string>(envelope.effects);
  const activable = new Set<TriggerKind>(envelope.triggers);
  const out: ControlFinding[] = [];
  for (const screen of air.screens) {
    for (const block of screen.blocks) {
      // Seuls les blocs porteurs d'une affordance comptent : un `header` ne
      // promet rien à l'utilisateur, un `button` si.
      if (!["button", "empty_state", "form", "list"].includes(block.blockType)) continue;
      for (const action of actionsOfBlock(air, block)) {
        out.push({
          screenId: screen.id,
          blockId: block.id,
          blockType: block.blockType,
          actionId: action.id,
          effectKind: action.effect.kind,
          executed: executable.has(action.effect.kind) && activable.has(action.trigger.kind),
        });
      }
    }
  }
  return out.sort((a, b) => byCodeUnit(a.blockId + a.actionId, b.blockId + b.actionId));
}

export interface RawReferenceFinding {
  readonly screenId: string;
  readonly blockId: string;
  readonly propKey: string;
  readonly fieldId: string;
  readonly targetEntityId: string;
}

/**
 * Champs `reference` AFFICHÉS — donc rendus en identifiant brut.
 *
 * Le registre de blocs n'accepte que des `fieldRef` de l'entité LIÉE : aucun
 * bloc ne peut afficher un champ de l'entité CIBLE. Un champ `reference`
 * placé dans `titleFieldId` produit une ligne intitulée `ent_x_row_2`.
 * Mesuré : 7 occurrences sur le corpus, dont un `titleFieldId`.
 */
export function rawReferences(air: Air): readonly RawReferenceFinding[] {
  const entities = new Map(air.entities.map((e) => [e.id, e]));
  const out: RawReferenceFinding[] = [];
  for (const screen of air.screens) {
    for (const block of screen.blocks) {
      if (block.entityId === undefined) continue;
      const entity = entities.get(block.entityId);
      if (entity === undefined) continue;
      const refs = new Map(
        entity.fields
          .filter((f) => f.type === "reference" && f.referencesEntityId !== undefined)
          .map((f) => [f.id, f.referencesEntityId ?? ""]),
      );
      for (const pair of block.props ?? []) {
        const values = Array.isArray(pair.value) ? pair.value : [pair.value];
        for (const value of values) {
          if (typeof value !== "string") continue;
          const target = refs.get(value);
          if (target === undefined) continue;
          out.push({
            screenId: screen.id,
            blockId: block.id,
            propKey: pair.key,
            fieldId: value,
            targetEntityId: target,
          });
        }
      }
    }
  }
  return out.sort((a, b) => byCodeUnit(a.blockId + a.propKey, b.blockId + b.propKey));
}
