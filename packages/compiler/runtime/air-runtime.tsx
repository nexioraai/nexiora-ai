// RUNTIME COPIÉ (compilateur 4.3, D-026 Option C) — pont UNIQUE et TESTÉ
// entre les données canoniques d'écran (modules .data générés) et les
// contrats des Smart Blocks gelés. Les écrans générés restent du code
// STRUCTUREL lisible (séquence de blocs explicite, points d'insertion de
// slots) ; toute la logique de correspondance vit ici, écrite une fois.
// F3 : AUCUN texte naturel dans ce module — tous les libellés viennent des
// données AIR ; les erreurs internes sont des codes.
// Effets d'actions en v1 compilateur : `navigate` est câblé ; les effets
// `capability`/`mutation`/`slot` sont des non-opérations STRUCTURÉES
// (implémentations : Phases 5+/9 — lecture consignée D-028).
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
// E1/E2 (D-129) — la vérité des lignes visibles vit dans un module PUR.
import { lignesVisibles, optionsDistinctes } from "./list-pipeline";
import type { FiltreEffectif, OperateurFiltre } from "./list-pipeline";
import { useNavigation } from "@react-navigation/native";
import {
  ButtonBlock,
  DetailHeaderBlock,
  EmptyStateBlock,
  FormBlock,
  HeaderBlock,
  ListBlock,
} from "../blocks/components";
import type { FormFieldSpec, ListItemData } from "../blocks/contracts";
import { useDataProvider } from "./data-provider";
import { useSlotRegistry } from "./slot-provider";
import { useCapabilityProvider } from "./capability-provider";
import { useSessionProvider } from "./session-provider";
import { useAllFormValues, useFormValues } from "./form-state";

export interface AirEffectData {
  kind: "navigate" | "capability" | "mutation" | "slot";
  screenId?: string;
  /** Effet `mutation` (D-061) — l'entité écrite et l'opération. */
  entityId?: string;
  operation?: string;
  /** Écran atteint UNE FOIS l'écriture réussie (1.5.0, D-070). */
  thenScreenId?: string;
  /** 1.13.0 — `route` (défaut) ou `session` : d'où vient la ligne à écrire. */
  instanceFrom?: string;
  /** Effet `capability` (D-059) — transporté pour être INVOQUÉ, plus ignoré. */
  capability?: string;
  method?: string;
  params?: Readonly<Record<string, unknown>>;
}

export type AirBlockVisibility =
  | { kind: "entity_empty" | "entity_not_empty"; entityId: string }
  /** 1.11.0 (Phase 4) — prédicat de SESSION : aucune entité interrogée. */
  | {
      kind: "session_authenticated" | "session_anonymous" | "session_pending_confirmation";
    };

export interface AirBlockInstanceData {
  id: string;
  blockType: string;
  entityId?: string;
  /** Condition de rendu (AIR 1.1.0) — absente = bloc toujours visible. */
  visibleWhen?: AirBlockVisibility;
  props: Readonly<Record<string, unknown>>;
}

/** Règle de validation (AIR `rules`, D-062) — appliquée AVANT toute écriture. */
export interface AirRuleData {
  entityId: string;
  assertions: readonly {
    fieldId: string;
    operator: string;
    /**
     * DÉFAUT CORRIGÉ (D-072) — ce type était écrit à la main et **plus étroit
     * que le schéma** : `jsonLeafSchema` autorise les TABLEAUX, qu'emploie
     * l'opérateur `in` (`value: ["payee", "annulee", …]`). Résultat : toute
     * application portant une règle `in` **ne compilait pas**. Mesuré sur le
     * corpus : 11 documents sur 14.
     */
    value?: string | number | boolean | null | readonly (string | number | boolean | null)[];
  }[];
}

export interface AirFieldData {
  id: string;
  name: string;
  type: string;
  /** Traversée de relation (1.4.0, D-064) — vers quoi, et quoi montrer. */
  referencesEntityId?: string;
  referenceDisplayFieldId?: string;
  /** Libellés d'affichage (AIR 1.10.0, DET-032) — RÉSOLUS par le compilateur
      dans la langue de l'app ; absents = comportement 1.9.0 (name/valeur). */
  label?: string;
  enumLabels?: Readonly<Record<string, string>>;
  /** 1.12.0 — saisie MASQUÉE, valeur jamais conservée. */
  sensitive?: boolean;
}

export interface AirSlotInvocationData {
  slotId: string;
  inputs: readonly {
    port: string;
    source:
      | { kind: "entity_rows"; entityId: string }
      | { kind: "literal"; value: unknown };
  }[];
  outputs: readonly { port: string; blockId: string; prop: string }[];
}

export interface AirScreenData {
  screenId: string;
  title: string;
  blocks: readonly AirBlockInstanceData[];
  actions: Readonly<Record<string, AirEffectData>>;
  uiActionsByBlock: Readonly<Record<string, string>>;
  entities: Readonly<Record<string, { fields: readonly AirFieldData[] }>>;
  /** Slots LIÉS dont au moins une sortie alimente un bloc de cet écran (1.3.0). */
  slotInvocations?: readonly AirSlotInvocationData[];
  /** Règles de validation des entités écrites depuis cet écran (D-062). */
  rules?: readonly AirRuleData[];
  /** Actions de CYCLE DE VIE de cet écran (D-068) — à l'ouverture, à la sortie. */
  lifecycle?: {
    onOpen?: readonly string[];
    onClose?: readonly string[];
  };
}

export interface AirScreenProps {
  route?: { params?: { itemId?: string } };
}

interface BlockRef {
  screen: AirScreenData;
  blockId: string;
}

/**
 * APPLICATION DES RÈGLES (D-062) — `air.rules` n'était lu NULLE PART.
 *
 * `rulesEnforced: false` : un document pouvait déclarer « le téléphone est
 * obligatoire » et l'app écrivait sans lui. La règle est désormais évaluée
 * AVANT l'écriture, et une violation ANNULE la mutation.
 *
 * Fermé par construction : seuls les opérateurs du schéma sont évalués, aucune
 * expression arbitraire. Un opérateur inconnu ne bloque JAMAIS — refuser sur
 * une règle qu'on ne sait pas lire serait s'arroger un jugement.
 */
function reglesRespectees(
  regles: readonly AirRuleData[] | undefined,
  entityId: string,
  valeurs: Readonly<Record<string, string>>,
): boolean {
  for (const regle of regles ?? []) {
    if (regle.entityId !== entityId) continue;
    for (const a of regle.assertions) {
      const brut = valeurs[a.fieldId];
      const nombre = brut === undefined ? Number.NaN : Number(brut);
      const attendu = a.value;
      switch (a.operator) {
        case "required":
          if (brut === undefined || brut.trim() === "") return false;
          break;
        case "eq":
          if (String(brut) !== String(attendu)) return false;
          break;
        case "neq":
          if (String(brut) === String(attendu)) return false;
          break;
        case "gt":
          if (!(nombre > Number(attendu))) return false;
          break;
        case "gte":
          if (!(nombre >= Number(attendu))) return false;
          break;
        case "lt":
          if (!(nombre < Number(attendu))) return false;
          break;
        case "lte":
          if (!(nombre <= Number(attendu))) return false;
          break;
        case "in":
          if (!Array.isArray(attendu) || !attendu.map(String).includes(String(brut))) return false;
          break;
        case "matches":
          if (brut === undefined || !new RegExp(String(attendu)).test(brut)) return false;
          break;
        default:
          break;
      }
    }
  }
  return true;
}

function block(screen: AirScreenData, blockId: string): AirBlockInstanceData {
  const found = screen.blocks.find((b) => b.id === blockId);
  if (found === undefined) throw new Error(`AIR_RUNTIME_BLOCK_MISSING:${blockId}`);
  return found;
}

/**
 * INVOCATION DES CODE SLOTS (1.3.0, D-058).
 *
 * Un slot LIÉ est exécuté à l'ouverture de l'écran, ses entrées prises à la
 * source déclarée, ses sorties écrites dans les props des blocs ciblés.
 *
 * Trois refus délibérés :
 * - **slot absent du registre** → aucune surcharge. Le bloc garde la prop que le
 *   document a déclarée. On n'invente pas une valeur pour un code non fourni.
 * - **slot qui lève** → aucune surcharge, l'écran continue de rendre. Un slot est
 *   du code d'auteur sous influence potentielle du prompt utilisateur (§4) : il
 *   ne doit jamais pouvoir abattre l'application.
 * - **port de sortie absent du résultat** → aucune surcharge pour CE port. Un
 *   `undefined` écrit dans une prop serait pire que l'absence.
 */
function useSlotOverrides(
  screen: AirScreenData,
): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
  const provider = useDataProvider();
  const registry = useSlotRegistry();
  const invocations = screen.slotInvocations;
  return useMemo(() => {
    const out: Record<string, Record<string, unknown>> = {};
    for (const invocation of invocations ?? []) {
      const fn = registry[invocation.slotId];
      if (fn === undefined) continue;
      const entrees: Record<string, unknown> = {};
      for (const { port, source } of invocation.inputs) {
        entrees[port] =
          source.kind === "entity_rows"
            ? provider.listInstances(source.entityId).map((i) => i.values)
            : source.value;
      }
      let resultat: Readonly<Record<string, unknown>>;
      try {
        resultat = fn(entrees);
      } catch {
        continue;
      }
      for (const { port, blockId, prop } of invocation.outputs) {
        const valeur = resultat[port];
        if (valeur === undefined) continue;
        (out[blockId] ??= {})[prop] = valeur;
      }
    }
    return out;
  }, [invocations, registry, provider]);
}

/** Props du bloc, surchargées par les sorties de slot qui le ciblent. */
function useBlockProps(
  screen: AirScreenData,
  blockId: string,
): Readonly<Record<string, unknown>> {
  const overrides = useSlotOverrides(screen);
  const base = block(screen, blockId).props;
  const surcharge = overrides[blockId];
  return surcharge === undefined ? base : { ...base, ...surcharge };
}

/**
 * État de la source de données pour un bloc (D-060).
 *
 * `loading` et `error` ne sont rendus que si le document a DÉCLARÉ leur titre :
 * le moteur n'invente aucun texte (F3), exactement comme pour `empty` depuis
 * l'origine. Un fournisseur sans `status` laisse le comportement de 1.0.0
 * inchangé.
 */
function useDataStatus(entityId: string | undefined): "loading" | "ready" | "error" {
  const provider = useDataProvider();
  if (entityId === undefined || provider.status === undefined) return "ready";
  return provider.status(entityId);
}

/**
 * Visibilité conditionnelle d'un bloc (AIR 1.1.0, D-044).
 *
 * Défaut corrigé : un bloc `empty_state` était rendu SANS condition, donc un
 * état vide s'affichait pendant que des données étaient présentes — observé
 * sur appareil, mesuré sur 19 écrans. Le prédicat est évalué sur la MÊME
 * source que la liste (le provider de données) : les deux ne peuvent donc
 * pas se contredire.
 */
function useBlockVisible(screen: AirScreenData, blockId: string): boolean {
  const provider = useDataProvider();
  // 1.11.0 — la session est lue INCONDITIONNELLEMENT : un hook ne se place pas
  // derrière une condition. Sans fournisseur, elle répond ANONYME.
  const session = useSessionProvider();
  const abonnerSession = useMemo(
    () => (ecouteur: () => void) => session.abonner(ecouteur),
    [session],
  );
  // Un SEUL abonnement, un SEUL instantané : deux `useSyncExternalStore`
  // pourraient être lus à des instants différents et se contredire.
  const etat = useSyncExternalStore(
    abonnerSession,
    () => (session.estAuthentifie() ? "auth" : session.enAttenteConfirmation?.() === true ? "attente" : "anon"),
    () => (session.estAuthentifie() ? "auth" : session.enAttenteConfirmation?.() === true ? "attente" : "anon"),
  );
  const authentifie = etat === "auth";
  const condition = block(screen, blockId).visibleWhen;
  if (condition === undefined) return true;
  // Discrimination POSITIVE sur les prédicats de DONNÉES : eux seuls portent
  // une entité. Exclure les autres ne suffit pas à restreindre le type.
  if (condition.kind === "entity_empty" || condition.kind === "entity_not_empty") {
    const vide = provider.listInstances(condition.entityId).length === 0;
    return condition.kind === "entity_empty" ? vide : !vide;
  }
  if (condition.kind === "session_pending_confirmation") return etat === "attente";
  return condition.kind === "session_authenticated" ? authentifie : !authentifie;
}

/**
 * TRAVERSÉE DE RELATION (D-064) — `relationTraversal: false` signifiait qu'un
 * champ `reference` s'affichait en IDENTIFIANT BRUT : « ent_plat_003 » au lieu
 * de « Thiéboudienne ». Mesuré : 6 occurrences au corpus.
 *
 * La résolution n'a lieu que si le document a DÉCLARÉ quoi montrer. Sans
 * déclaration, l'identifiant reste affiché — on ne devine pas.
 */
function useResolveField(
  screen: AirScreenData,
  entityId: string | undefined,
): (fieldId: string, brut: string | undefined) => string | undefined {
  const provider = useDataProvider();
  return (fieldId, brut) => {
    if (brut === undefined || entityId === undefined) return brut;
    const champ = screen.entities[entityId]?.fields.find((f) => f.id === fieldId);
    const cible = champ?.referencesEntityId;
    const affiche = champ?.referenceDisplayFieldId;
    if (cible !== undefined && affiche !== undefined) {
      return provider.getInstance(cible, brut)?.values[affiche] ?? brut;
    }
    // DET-032 — un code d'enum ne se montre pas : si le document a déclaré un
    // libellé pour cette valeur, c'est LUI qui s'affiche. Données, filtrage et
    // testID continuent de porter la valeur brute.
    return champ?.enumLabels?.[brut] ?? brut;
  };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** E1 (D-129) — lecture sûre d'un prop tableau de chaînes du flat config. */
function strArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function useDispatch(screen: AirScreenData) {
  const navigation = useNavigation();
  const capabilities = useCapabilityProvider();
  const data = useDataProvider();
  // D-083 : une action `mutation` portée par un BOUTON n'a aucune valeur propre.
  // Les documents générés câblent pourtant « Valider » sur un bouton, pas sur le
  // formulaire. Sans cette lecture, l'écriture partait vide et la règle de
  // validation la refusait — en silence.
  const saisies = useAllFormValues();
  // 1.13.0 — l'identité courante, pour les mutations dont l'instance EST la
  // personne connectée. Lue inconditionnellement : un hook ne se place pas
  // derrière une condition.
  const identiteSession = useSessionProvider().identifiant();
  return useMemo(
    () => (actionId: string | undefined, values?: Readonly<Record<string, string>>) => {
      if (actionId === undefined) return;
      const effect = screen.actions[actionId];
      if (effect?.kind === "navigate" && effect.screenId !== undefined) {
        (navigation.navigate as (name: string) => void)(effect.screenId);
        return;
      }
      // CAPABILITY (D-059) : l'effet n'est plus AVALÉ. Il est présenté au
      // fournisseur, qui répond s'il l'a honoré. Sans implémentation fournie,
      // le défaut REFUSE ET TRACE — il ne prétend jamais avoir agi.
      if (effect?.kind === "capability" && effect.capability !== undefined) {
        // Phase 4 : les valeurs SAISIES accompagnent l'appel, exactement comme
        // pour les mutations (D-061/D-083). Sans elles, une connexion partirait
        // sans identité — l'effet s'exécuterait, et ne pourrait rien établir.
        // Les params DÉCLARÉS restent prioritaires : ils sont la configuration
        // du document, la saisie est la donnée de l'instant.
        capabilities.invoke({
          capability: effect.capability,
          method: effect.method ?? "",
          params: { ...(values ?? saisies), ...(effect.params ?? {}) },
        });
        return;
      }
      // MUTATION (D-061) : l'effet n'est plus une non-opération. L'écriture est
      // présentée au fournisseur de données ; un fournisseur en LECTURE SEULE
      // n'expose pas la méthode et l'appel est simplement absent — jamais un
      // faux succès.
      if (effect?.kind === "mutation" && effect.entityId !== undefined) {
        const cible = effect.entityId;
        const saisie = values ?? saisies;
        // D-062 : une écriture qui viole une règle déclarée est ANNULÉE.
        if (!reglesRespectees(screen.rules, cible, saisie)) return;
        let ecrit = false;
        if (effect.operation === "create") ecrit = data.create?.(cible, saisie) ?? false;
        else if (effect.operation === "update") {
          // 1.13.0 — l'instance vient de la SESSION ou de la route. Sans
          // identité établie, on n'écrit RIEN : écrire « quelque part » serait
          // écrire la ligne de quelqu'un d'autre.
          const id = effect.instanceFrom === "session" ? identiteSession : saisie.id;
          if (id !== undefined) {
            // UPSERT quand l'instance est la SESSION : au premier
            // enregistrement, la ligne n'existe pas encore — un `update` seul
            // échouerait en silence, exactement le défaut qu'on corrige.
            const misAJour = data.update?.(cible, id, saisie) ?? false;
            ecrit =
              misAJour ||
              (effect.instanceFrom === "session" && data.upsert?.(cible, id, saisie) === true);
          }
        } else if (effect.operation === "delete") {
          const id = saisie.id;
          if (id !== undefined) ecrit = data.remove?.(cible, id) ?? false;
        }
        // D-070 : on ne navigue QUE si l'écriture a réussi. Envoyer l'utilisateur
        // sur un écran de confirmation après un refus serait un mensonge de
        // l'interface — la faute exacte que ce chantier traque.
        if (ecrit && effect.thenScreenId !== undefined) {
          (navigation.navigate as (name: string) => void)(effect.thenScreenId);
        }
        return;
      }
      // slot : invoqué au RENDU, pas ici.
    },
    [navigation, screen, capabilities, data, saisies],
  );
}

function useItemNavigate(screen: AirScreenData, blockId: string) {
  const navigation = useNavigation();
  const actionId = screen.uiActionsByBlock[blockId];
  const effect = actionId === undefined ? undefined : screen.actions[actionId];
  // AFFORDANCE : sans effet `navigate`, l'AIR ne promet RIEN sur cette ligne —
  // elle ne doit donc pas être pressable. Retourner une fonction inerte rendait
  // chaque ligne appuyable et muette : 46 lignes sur les 2 slices [MESURÉ à
  // l'exécution, APP-D002]. Le contrat de bloc sait déjà ne câbler aucun
  // `onPress` quand `onItemPress` est absent (`components.tsx`) ; il fallait le
  // lui dire ici. On ne FABRIQUE aucun comportement : on retire une promesse
  // que rien ne fondait.
  if (effect?.kind !== "navigate" || effect.screenId === undefined) return undefined;
  const cible = effect.screenId;
  return (itemId: string) => {
    (
      navigation.navigate as (name: string, params: { itemId: string }) => void
    )(cible, { itemId });
  };
}

/**
 * CYCLE DE VIE D'UN ÉCRAN (D-068) — `triggers: ["ui"]` signifiait que le moteur
 * n'exécutait QUE les actions déclenchées par un appui. **62 actions
 * `lifecycle` du corpus étaient déclarées et purement ignorées** — un pan entier
 * du contrat d'action sans aucune implémentation.
 *
 * Les actions d'ouverture sont exécutées au montage, celles de sortie au
 * démontage. Le dispatcher décide ensuite, effet par effet, si quelque chose se
 * produit : une action `lifecycle` dont l'effet reste hors enveloppe n'est PAS
 * rendue vivante par ce câblage.
 */
export function AirScreenLifecycle({ screen }: { screen: AirScreenData }) {
  const dispatch = useDispatch(screen);
  const cycle = screen.lifecycle;
  useEffect(() => {
    for (const id of cycle?.onOpen ?? []) dispatch(id);
    return () => {
      for (const id of cycle?.onClose ?? []) dispatch(id);
    };
  }, [dispatch, cycle]);
  return null;
}

export function AirHeader({ screen, blockId }: BlockRef) {
  const visible = useBlockVisible(screen, blockId);
  const b = block(screen, blockId);
  // Props SURCHARGÉES par les sorties des slots liés (1.3.0, D-058).
  const props = useBlockProps(screen, blockId);
  if (!visible) return null;
  const title = str(props.title);
  if (title === undefined) throw new Error(`AIR_RUNTIME_PROP_MISSING:${blockId}:title`);
  return <HeaderBlock testID={b.id} title={title} subtitle={str(props.subtitle)} />;
}

export function AirButton({ screen, blockId }: BlockRef) {
  const visible = useBlockVisible(screen, blockId);
  const b = block(screen, blockId);
  // Props SURCHARGÉES par les sorties des slots liés (1.3.0, D-058).
  const props = useBlockProps(screen, blockId);
  const dispatch = useDispatch(screen);
  if (!visible) return null;
  const label = str(props.label);
  const actionId = str(props.actionId);
  if (label === undefined || actionId === undefined) {
    throw new Error(`AIR_RUNTIME_PROP_MISSING:${blockId}:label|actionId`);
  }
  const kind = props.kind === "ghost" ? ("ghost" as const) : ("primary" as const);
  // AFFORDANCE (D-084) — un effet `slot` est calculé AU RENDU, jamais sur un
  // appui : le dispatcher n'a aucune branche pour lui. Un bouton « Appliquer les
  // filtres » câblé sur un slot était donc PRESSABLE ET MUET. Mesuré sur les
  // 26 applications : c'est l'une des deux causes des 201 contrôles fantômes.
  // On ne fabrique aucun comportement — on retire une promesse que rien ne
  // fonde. Exactement le remède d'`APP-D002`, appliqué à un second effet.
  const effet = screen.actions[actionId]?.kind;
  const inerte = effet === "slot";
  return (
    <ButtonBlock
      testID={b.id}
      label={label}
      kind={kind}
      onPress={inerte ? undefined : () => dispatch(actionId)}
    />
  );
}

export function AirEmptyState({ screen, blockId }: BlockRef) {
  const visible = useBlockVisible(screen, blockId);
  const b = block(screen, blockId);
  // Props SURCHARGÉES par les sorties des slots liés (1.3.0, D-058).
  const props = useBlockProps(screen, blockId);
  const dispatch = useDispatch(screen);
  if (!visible) return null;
  const title = str(props.title);
  if (title === undefined) throw new Error(`AIR_RUNTIME_PROP_MISSING:${blockId}:title`);
  const actionId = str(props.actionId);
  return (
    <EmptyStateBlock
      testID={b.id}
      title={title}
      message={str(props.message)}
      actionLabel={str(props.actionLabel)}
      onAction={actionId === undefined ? undefined : () => dispatch(actionId)}
    />
  );
}

export function AirDetailHeader({
  screen,
  blockId,
  itemId,
}: BlockRef & { itemId?: string }) {
  const visible = useBlockVisible(screen, blockId);
  const b = block(screen, blockId);
  // Props SURCHARGÉES par les sorties des slots liés (1.3.0, D-058).
  const props = useBlockProps(screen, blockId);
  const provider = useDataProvider();
  const statut = useDataStatus(b.entityId);
  const resoudre = useResolveField(screen, b.entityId);
  if (!visible) return null;
  if (b.entityId === undefined) throw new Error(`AIR_RUNTIME_ENTITY_MISSING:${blockId}`);
  const instance = provider.getInstance(b.entityId, itemId);
  // États du registre 1.1.0 (D-060) — rendus seulement si le titre est DÉCLARÉ.
  const loadingTitle = str(props.loadingTitle);
  const errorTitle = str(props.errorTitle);
  const emptyTitle = str(props.emptyTitle);
  const etat =
    statut === "loading" && loadingTitle !== undefined
      ? ({ kind: "loading", title: loadingTitle } as const)
      : statut === "error" && errorTitle !== undefined
        ? ({ kind: "error", title: errorTitle, message: str(props.errorMessage) } as const)
        : instance === undefined && emptyTitle !== undefined
          ? ({ kind: "empty", title: emptyTitle, message: str(props.emptyMessage) } as const)
          : ({ kind: "ready" } as const);
  const value = (fieldId: unknown): string =>
    typeof fieldId === "string"
      ? (resoudre(fieldId, instance?.values[fieldId]) ?? "")
      : "";
  const badgeIds = Array.isArray(props.badgeFieldIds) ? props.badgeFieldIds : undefined;
  return (
    <DetailHeaderBlock
      testID={b.id}
      state={etat}
      {...(str(props.imageFieldId) !== undefined &&
      value(props.imageFieldId) !== ""
        ? { imageUri: value(props.imageFieldId) }
        : {})}
      title={value(props.titleFieldId)}
      subtitle={
        props.subtitleFieldId === undefined ? undefined : value(props.subtitleFieldId)
      }
      // D-076 : un badge VIDE n'est pas un badge — il rendait une pastille sans
      // texte et provoquait une collision de clés. On ne rend que les valeurs
      // réellement présentes ; `undefined` si aucune ne l'est.
      badges={
        badgeIds === undefined
          ? undefined
          : (() => {
              const v = badgeIds.map((id) => value(id)).filter((x) => x !== "");
              return v.length === 0 ? undefined : v;
            })()
      }
      trailing={
        props.trailingFieldId === undefined ? undefined : value(props.trailingFieldId)
      }
    />
  );
}

export function AirList({ screen, blockId, itemId }: BlockRef & { itemId?: string }) {
  const visible = useBlockVisible(screen, blockId);
  const b = block(screen, blockId);
  // Props SURCHARGÉES par les sorties des slots liés (1.3.0, D-058).
  const props = useBlockProps(screen, blockId);
  const provider = useDataProvider();
  const statut = useDataStatus(b.entityId);
  const resoudre = useResolveField(screen, b.entityId);
  // Saisie de recherche — LOCALE à la liste : chercher dans un catalogue n'est
  // pas un état d'application, et le partager entre écrans surprendrait.
  const [recherche, setRecherche] = useState("");
  // E1 (D-129) — saisies des filtres PILOTÉS, locales à la liste comme la
  // recherche. Une valeur vide = filtre inactif.
  const [saisiesFiltres, setSaisiesFiltres] = useState<Readonly<Record<number, string>>>({});
  const onItemNavigate = useItemNavigate(screen, blockId);
  if (!visible) return null;
  if (b.entityId === undefined) throw new Error(`AIR_RUNTIME_ENTITY_MISSING:${blockId}`);
  const titleFieldId = str(props.titleFieldId);
  if (titleFieldId === undefined) {
    throw new Error(`AIR_RUNTIME_PROP_MISSING:${blockId}:titleFieldId`);
  }
  // E1/E2 (D-129) — TRI / FILTRES / PAGINATION / PORTÉE : la vérité vit dans
  // `lignesVisibles` (module pur, testé sans rendu). Ici : lire les props,
  // tenir les saisies, déléguer.
  const brutes0 = provider.listInstances(b.entityId);
  const rechercheChamp = str(props.searchFieldId);
  const filtreChamp = str(props.filterFieldId);
  const filtreValeur = str(props.filterValue);
  const champsPilotes = strArray(props.userFilterFieldIds);
  const operateursPilotes = strArray(props.userFilterOperators);
  const typesPilotes = strArray(props.userFilterInputTypes);
  const filtres: FiltreEffectif[] = [
    ...(filtreChamp !== undefined && filtreValeur !== undefined
      ? [{
          fieldId: filtreChamp,
          operator: (str(props.filterOperator) ?? "eq") as OperateurFiltre,
          valeur: filtreValeur,
        }]
      : []),
    ...champsPilotes.map((fieldId, i) => ({
      fieldId,
      operator: (operateursPilotes[i] ?? "eq") as OperateurFiltre,
      valeur: saisiesFiltres[i] ?? "",
    })),
  ];
  const scopeChamp = str(props.scopeFieldId);
  const instances = lignesVisibles(brutes0, {
    scopeFieldId: scopeChamp,
    instanceId: itemId,
    rechercheChamp,
    recherche,
    filtres,
    triChamp: str(props.sortFieldId),
    triDesc: props.sortDirection === "desc",
    borne: typeof props.pageSize === "number" ? props.pageSize : undefined,
  });
  // Options des filtres `choice` — valeurs distinctes du PÉRIMÈTRE scopé,
  // jamais du dataset entier d'un autre parent.
  const scopees =
    scopeChamp === undefined
      ? brutes0
      : itemId === undefined
        ? []
        : brutes0.filter((i) => (i.values[scopeChamp] ?? "") === itemId);
  // DET-032 : le TITRE d'un filtre est le libellé déclaré du champ — `name`
  // (identifiant machine) ne sert que de repli 1.9.0.
  const champsEntite = screen.entities[b.entityId]?.fields ?? [];
  const nomsChamps = new Map(champsEntite.map((f) => [f.id, f.label ?? f.name]));
  const enumLabelsParChamp = new Map(champsEntite.map((f) => [f.id, f.enumLabels]));
  const filtresSpec =
    champsPilotes.length === 0
      ? undefined
      : champsPilotes.map((fieldId, i) => ({
          label: nomsChamps.get(fieldId) ?? fieldId,
          value: saisiesFiltres[i] ?? "",
          onChange: (v: string) =>
            setSaisiesFiltres((s) => ({ ...s, [i]: v })),
          inputType: (typesPilotes[i] === "choice" ? "choice" : "text") as "text" | "choice",
          ...(typesPilotes[i] === "choice"
            ? {
                options: optionsDistinctes(scopees, fieldId),
                // DET-032 — les chips affichent le libellé, filtrent la valeur.
                ...(enumLabelsParChamp.get(fieldId) === undefined
                  ? {}
                  : { optionLabels: enumLabelsParChamp.get(fieldId) }),
              }
            : {}),
        }));
  const pick = (fieldId: unknown, values: Readonly<Record<string, string>>) =>
    typeof fieldId === "string" ? resoudre(fieldId, values[fieldId]) : undefined;
  const imageFieldId = str(props.imageFieldId);
  const items: ListItemData[] = instances.map((instance) => ({
    id: instance.id,
    // VIGNETTE (D-087) — seulement si le document a DÉCLARÉ quel champ porter.
    // Une valeur vide n'est pas une image : on n'en rend aucune.
    ...(imageFieldId !== undefined && (instance.values[imageFieldId] ?? "") !== ""
      ? { imageUri: instance.values[imageFieldId] }
      : {}),
    title: resoudre(titleFieldId, instance.values[titleFieldId]) ?? "",
    subtitle: pick(props.subtitleFieldId, instance.values),
    trailing: pick(props.trailingFieldId, instance.values),
    badge: pick(props.badgeFieldId, instance.values),
  }));
  const emptyTitle = str(props.emptyTitle);
  const loadingTitle = str(props.loadingTitle);
  const errorTitle = str(props.errorTitle);
  const state =
    statut === "loading" && loadingTitle !== undefined
      ? ({ kind: "loading", title: loadingTitle } as const)
      : statut === "error" && errorTitle !== undefined
        ? ({ kind: "error", title: errorTitle, message: str(props.errorMessage) } as const)
        : items.length === 0 && emptyTitle !== undefined
          ? ({ kind: "empty", title: emptyTitle, message: str(props.emptyMessage) } as const)
          : ({ kind: "ready" } as const);
  return (
    <ListBlock
      testID={b.id}
      title={str(props.title)}
      items={items}
      state={state}
      // RECHERCHE (D-087) — rendue EN TÊTE de la liste, donc en haut de l'écran
      // de catalogue. Filtre client sur le champ DÉCLARÉ par le document.
      search={
        rechercheChamp === undefined
          ? undefined
          : { value: recherche, onChange: setRecherche, placeholder: str(props.searchPlaceholder) }
      }
      filters={filtresSpec}
      onItemPress={onItemNavigate}
    />
  );
}

export function AirForm({ screen, blockId, itemId }: BlockRef & { itemId?: string }) {
  const visible = useBlockVisible(screen, blockId);
  const b = block(screen, blockId);
  // Props SURCHARGÉES par les sorties des slots liés (1.3.0, D-058).
  const props = useBlockProps(screen, blockId);
  const dispatch = useDispatch(screen);
  const statut = useDataStatus(b.entityId);
  // D-066 : l'état vit AU-DESSUS des écrans. Un retour en arrière ne vide plus
  // le formulaire — défaut mesuré sur le parcours de commande.
  const [values, changer] = useFormValues(blockId);
  if (!visible) return null;
  if (b.entityId === undefined) throw new Error(`AIR_RUNTIME_ENTITY_MISSING:${blockId}`);
  const fieldsById = new Map(
    (screen.entities[b.entityId]?.fields ?? []).map((f) => [f.id, f]),
  );
  const fieldIds = Array.isArray(props.fieldIds) ? props.fieldIds : [];
  // DET-032 (AIR 1.10.0) : le libellé rendu est celui que le document DÉCLARE
  // (`field.label`, résolu par le compilateur) ; `field.name` reste le repli
  // 1.9.0 — donnée AIR dans les deux cas, jamais un texte moteur (D-028/F3).
  const fields: FormFieldSpec[] = fieldIds.flatMap((fieldId) => {
    if (typeof fieldId !== "string") return [];
    const field = fieldsById.get(fieldId);
    if (field === undefined) return [];
    return [
      {
        id: field.id,
        label: field.label ?? field.name,
        // 1.12.0 — un champ sensible se saisit en clair pour la personne, pas
        // pour l'épaule d'à côté.
        ...(field.sensitive === true ? { secure: true } : {}),
      },
    ];
  });
  const submitLabel = str(props.submitLabel);
  if (submitLabel === undefined) {
    throw new Error(`AIR_RUNTIME_PROP_MISSING:${blockId}:submitLabel`);
  }
  const actionId = screen.uiActionsByBlock[blockId];
  return (
    <FormBlock
      testID={b.id}
      title={str(props.title)}
      fields={fields}
      values={values}
      onChangeField={changer}
      submitLabel={submitLabel}
      // D-061 : les valeurs SAISIES accompagnent l'action — sans elles, une
      // création écrirait un enregistrement vide.
      // VOLET 1 — l'instance COURANTE accompagne la saisie : sans elle, une
      // mutation `update` n'avait aucune ligne à modifier. `id` n'est pas un
      // champ du formulaire : il vient de la ROUTE, pas d'une saisie.
      onSubmit={() => dispatch(actionId, itemId === undefined ? values : { ...values, id: itemId })}
      // États du registre 1.1.0 (D-060) : `loading` et `error` deviennent
      // atteignables dès que la source les rapporte ET que le titre est déclaré.
      // `empty` pour un formulaire = AUCUN champ à saisir. État réel, pas une
      // commodité : un formulaire sans champ rendu vide serait un écran muet.
      state={
        statut === "loading" || statut === "error"
          ? statut
          : fields.length === 0 && str(props.emptyTitle) !== undefined
            ? "empty"
            : "ready"
      }
      loadingTitle={str(props.loadingTitle)}
      emptyTitle={str(props.emptyTitle)}
      errorMessage={str(props.errorMessage)}
    />
  );
}
