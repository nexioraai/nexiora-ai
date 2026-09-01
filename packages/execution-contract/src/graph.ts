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
// Sous-chemin `/registry` — même motif que `feasibility.ts` : l index de
// `@deribfy/blocks` tire `components.tsx` (JSX), inutilisable ici.
import { BLOCS_AFFORDANTS, getBlock } from "@deribfy/blocks/registry";
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

  // ── D-099 · LA BARRE PERSISTANTE EST UNE RACINE D'ATTEIGNABILITÉ.
  //
  // CAUSE RACINE, révélée par la génération P6 sur données réelles. Cette
  // fonction ne connaissait que les actions `navigate` et `mutation`. Un écran
  // atteignable UNIQUEMENT par un onglet de `navigation.primary` était donc
  // déclaré MORT — et les promesses qui le visaient signalées à tort comme
  // cibles mortes. Mesuré : `scr_prestations` et `scr_compte`, tous deux
  // destinations primaires, plus trois promesses accusées à tort.
  //
  // Le document était CORRECT ; c'est l'oracle qui n'avait pas suivi AIR 1.6.0.
  // Le moteur, lui, les atteint : la barre est rendue sur CHAQUE écran et
  // presser un onglet navigue — observé au rendu, contrôle négatif inclus.
  //
  // Ces destinations sont donc des racines au même titre que l'écran d'entrée :
  // la barre est présente partout, il n'existe aucune condition d'origine à
  // satisfaire. La lecture reste GÉNÉRIQUE — routes et destinations déclarées
  // dans l'AIR, aucun identifiant en dur.
  if (air.navigation.primary !== undefined) {
    const ecranDeRoute = new Map(air.navigation.routes.map((r) => [r.id, r.screenId]));
    for (const destination of air.navigation.primary.destinations) {
      const ecran = ecranDeRoute.get(destination.routeId);
      if (ecran !== undefined && screenIds.has(ecran)) reached.add(ecran);
    }
  }

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
/**
 * L'application émise dispatche-t-elle RÉELLEMENT cette action depuis ce bloc ?
 *
 * Deux conventions coexistent, et la distinction se DÉRIVE du registre :
 *  · `actionRefProps` contient `actionId` (button, empty_state) → le runtime lit
 *    la PROP du bloc ; le déclencheur est décoratif ;
 *  · sinon (form, list) → le runtime lit `uiActionsByBlock`, donc le déclencheur.
 */
function dispatcheReellement(
  air: Air,
  block: { readonly id: string; readonly blockType: string; readonly props?: readonly { key: string; value: unknown }[] },
  actionId: string,
): boolean {
  const definition = getBlock(block.blockType);
  if (definition === undefined) return false;
  if (!definition.actionRefProps.includes("actionId")) return true;
  return (block.props ?? []).some((p) => p.key === "actionId" && p.value === actionId);
}

export function controls(air: Air, envelope: ExecutionEnvelope): readonly ControlFinding[] {
  const executable = new Set<string>(envelope.effects);
  const activable = new Set<TriggerKind>(envelope.triggers);
  const out: ControlFinding[] = [];
  for (const screen of air.screens) {
    for (const block of screen.blocks) {
      // Seuls les blocs porteurs d'une affordance comptent : un `header` ne
      // promet rien à l'utilisateur, un `button` si.
      // D-104 — DÉRIVÉ DU REGISTRE, plus recopié. Cette liste était écrite à la
      // main ; une génération réelle a placé trois actions sur `detail_header`,
      // absent de la liste, et `controls()` ne les a pas vues. Le registre est
      // désormais la source unique, partagée avec le validateur.
      if (!BLOCS_AFFORDANTS.has(block.blockType)) continue;
      for (const action of actionsOfBlock(air, block)) {
        out.push({
          screenId: screen.id,
          blockId: block.id,
          blockType: block.blockType,
          actionId: action.id,
          effectKind: action.effect.kind,
          // ── D-105 · `executed` EXIGE UN DISPATCH RÉEL.
          //
          // CAUSE RACINE, mesurée sur les 24 documents : `executed` ne regardait
          // que l'enveloppe. Or `button` et `empty_state` dispatchent par leur
          // prop `actionId` — le déclencheur y est décoratif. 17 actions dont le
          // déclencheur visait un bloc dispatchant AUTRE CHOSE étaient donc
          // déclarées exécutées alors que le runtime ne les appelle jamais.
          // Faux vert, contaminant F1 : une promesse visant l'une d'elles était
          // jugée vivante.
          //
          // La correction est ici, pas au validateur : refuser ces documents
          // aurait invalidé le corpus GELÉ, qui en porte 3 et sert de base de
          // comparaison à toutes les mesures historiques. L'oracle doit dire la
          // vérité ; les gates en tirent les conséquences.
          executed:
            executable.has(action.effect.kind) &&
            activable.has(action.trigger.kind) &&
            dispatcheReellement(air, block, action.id),
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
