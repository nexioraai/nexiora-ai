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

/** Traits STRUCTURELS d'un écran — cumulables, jamais exclusifs. */
export const SCREEN_TRAITS = ["entry", "detail", "listing", "form", "statique"] as const;
export type ScreenTrait = (typeof SCREEN_TRAITS)[number];

export interface ScreenTraitFinding {
  readonly screenId: string;
  /** Traits portés, dans l'ordre canonique de `SCREEN_TRAITS`. Jamais vide. */
  readonly traits: readonly ScreenTrait[];
}

/**
 * TRAITS STRUCTURELS D'UN ÉCRAN, DÉRIVÉS DE SES BLOCS RÉELS.
 *
 * ── POURQUOI CE N'EST PAS UN CHAMP DÉCLARÉ
 *
 * `D-086` : **l'AIR ne connaît aucune catégorie métier.** Le contrat porte la
 * CONCLUSION architecturale, jamais l'étiquette de secteur qui a servi à la
 * produire — sinon le compilateur devrait connaître les métiers, et le moteur
 * cesserait d'être agnostique. Le cliquet `agnostic.test.ts` refuse d'ailleurs
 * jusqu'au NOM d'un secteur dans ce fichier : il a mordu sur la première
 * rédaction de ce commentaire, qui citait D-086 mot à mot. Il a eu raison. Les traits
 * ci-dessous sont donc DÉRIVÉS, jamais déclarés : aucun champ n'entre à l'AIR,
 * aucune migration n'est due, aucun `rootHash` ne bouge.
 *
 * ── POURQUOI UN ENSEMBLE, ET NON UNE VALEUR
 *
 * `FACT`, mesuré sur les **154 écrans** des corpus v2 et v3 : **45 écrans, soit
 * 29 %, portent plus d'un trait.** Un écran `detail+listing` — une fiche et la
 * liste de ses éléments liés — n'est pas un défaut, c'est une composition
 * normale. Observé : 20 × `detail+listing`, 15 × `listing+form`,
 * 9 × `detail+form`, 1 × `detail+listing+form`.
 *
 * Un champ `role` à valeur unique serait donc **faux par construction** sur près
 * d'un écran sur trois. Ce module rend un ENSEMBLE, et les règles qui s'y
 * indexeront devront le traiter comme tel.
 *
 * ── D'OÙ VIENNENT LES TRAITS
 *
 * Des MÊMES blocs que les mécanismes existants, jamais d'une recopie —
 * `D-095` : la duplication se supprime à la source, elle ne se surveille pas.
 *   · `detail`   ← un bloc `detail_header`, exactement la source de `detailScreens`
 *   · `listing`  ← un bloc `list` (le registre lui impose une entité)
 *   · `form`     ← un bloc `form`
 *   · `entry`    ← `navigation.entryScreenId`, seule notion d'accueil du contrat
 *   · `statique` ← AUCUN des trois traits de contenu ci-dessus
 *
 * `entry` est ORTHOGONAL : un écran d'entrée cumule ses traits de contenu, ou
 * porte `statique` s'il n'en a aucun (mesuré : 2 documents sur 24).
 *
 * Ce module ne juge rien. Il DIT ce qu'un écran est, structurellement ; les
 * verdicts appartiennent aux gates qui le consommeront.
 */
export function screenTraits(air: Air): readonly ScreenTraitFinding[] {
  const entryId = air.navigation.entryScreenId;
  return air.screens
    .map((screen) => {
      const types = new Set(screen.blocks.map((b) => b.blockType));
      const contenu: ScreenTrait[] = [];
      if (types.has("detail_header")) contenu.push("detail");
      if (types.has("list")) contenu.push("listing");
      if (types.has("form")) contenu.push("form");
      const traits: ScreenTrait[] = [];
      if (screen.id === entryId) traits.push("entry");
      traits.push(...(contenu.length > 0 ? contenu : (["statique"] as const)));
      // Ordre canonique : le résultat ne dépend pas de l'ordre des blocs.
      traits.sort((a, b) => SCREEN_TRAITS.indexOf(a) - SCREEN_TRAITS.indexOf(b));
      return { screenId: screen.id, traits };
    })
    .sort((a, b) => byCodeUnit(a.screenId, b.screenId));
}

export interface FormulaireSansActionFinding {
  readonly screenId: string;
  readonly blockId: string;
}

/**
 * FORMULAIRES QUI PROMETTENT UNE SOUMISSION QUE RIEN N'EXÉCUTE.
 *
 * ── CAUSE RACINE MESURÉE (2026-09-01)
 *
 * Le contrat impose qu'un `button` porte son action — `actionId` est REQUIS à son
 * schéma, avec la mention « un CTA sans action ». Il n'impose RIEN d'équivalent à
 * un `form` : son `actionRefProps` est VIDE, et le câblage de sa soumission vit
 * dans une entrée séparée de `actions[]` dont rien n'exige l'existence.
 *
 * Le pont de validation ne vérifie d'ailleurs que le sens INVERSE
 * (`BLOCK_TRIGGER_SANS_AFFORDANCE`, D-104) : une action doit cibler un bloc
 * actionnable. Jamais qu'un bloc actionnable possède une action.
 *
 * `FACT`, mesuré sur les 24 documents : **7 formulaires muets sur 45 (15,6 %)**,
 * contre **0 bouton muet sur 259 (0 %)**. Cette asymétrie est la signature de la
 * cause : si le défaut venait de l'inattention du générateur, les boutons seraient
 * touchés dans les mêmes proportions. Ils ne le sont jamais — leur schéma les
 * protège. Trois de ces formulaires portent un bouton de paiement ou de
 * confirmation qui ne fait rien.
 *
 * ── POURQUOI `form` SEUL, ET NON TOUT BLOC AFFORDANT
 *
 * `FACT` — la même règle appliquée aux quatre blocs affordants
 * (`button`, `empty_state`, `form`, `list`) signalerait **111 blocs**, dont la
 * quasi-totalité sont des `list`. Or une liste qui AFFICHE sans ouvrir de détail
 * est une composition parfaitement légitime, et un `empty_state` sans action
 * aussi. Seul le `form` rend TOUJOURS un bouton de soumission portant un
 * `submitLabel` : c'est une PROMESSE faite à l'utilisateur. Élargir la règle
 * produirait 104 faux positifs et détruirait sa valeur.
 *
 * Cette fonction NE JUGE PAS et ne refuse rien : elle DIT. Le pont de validation
 * du registre reste inchangé, le compilateur n'en voit rien, et aucun document
 * existant ne devient invalide.
 */
export function formulairesSansAction(air: Air): readonly FormulaireSansActionFinding[] {
  const cibleesParDeclencheur = new Set(
    air.actions.flatMap((a) => (a.trigger.kind === "ui" ? [a.trigger.blockId] : [])),
  );
  return air.screens
    .flatMap((screen) =>
      screen.blocks
        .filter((block) => block.blockType === "form")
        // Une action peut être atteinte par le déclencheur OU par une prop de
        // référence d'action — on interroge les DEUX, comme `actionsOfBlock`.
        .filter(
          (block) =>
            !cibleesParDeclencheur.has(block.id) && actionsOfBlock(air, block).length === 0,
        )
        .map((block) => ({ screenId: screen.id, blockId: block.id })),
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
