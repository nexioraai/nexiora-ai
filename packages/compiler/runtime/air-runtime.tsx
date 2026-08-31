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
import { useMemo, useState } from "react";
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

export interface AirEffectData {
  kind: "navigate" | "capability" | "mutation" | "slot";
  screenId?: string;
  /** Effet `capability` (D-059) — transporté pour être INVOQUÉ, plus ignoré. */
  capability?: string;
  method?: string;
  params?: Readonly<Record<string, unknown>>;
}

export interface AirBlockVisibility {
  kind: "entity_empty" | "entity_not_empty";
  entityId: string;
}

export interface AirBlockInstanceData {
  id: string;
  blockType: string;
  entityId?: string;
  /** Condition de rendu (AIR 1.1.0) — absente = bloc toujours visible. */
  visibleWhen?: AirBlockVisibility;
  props: Readonly<Record<string, unknown>>;
}

export interface AirFieldData {
  id: string;
  name: string;
  type: string;
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
}

export interface AirScreenProps {
  route?: { params?: { itemId?: string } };
}

interface BlockRef {
  screen: AirScreenData;
  blockId: string;
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
  const condition = block(screen, blockId).visibleWhen;
  if (condition === undefined) return true;
  const vide = provider.listInstances(condition.entityId).length === 0;
  return condition.kind === "entity_empty" ? vide : !vide;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function useDispatch(screen: AirScreenData) {
  const navigation = useNavigation();
  const capabilities = useCapabilityProvider();
  return useMemo(
    () => (actionId: string | undefined) => {
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
        capabilities.invoke({
          capability: effect.capability,
          method: effect.method ?? "",
          params: effect.params ?? {},
        });
        return;
      }
      // mutation : non-opération v1 (Phase 5+). slot : invoqué au RENDU, pas ici.
    },
    [navigation, screen, capabilities],
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
  return (
    <ButtonBlock testID={b.id} label={label} kind={kind} onPress={() => dispatch(actionId)} />
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
    typeof fieldId === "string" ? (instance?.values[fieldId] ?? "") : "";
  const badgeIds = Array.isArray(props.badgeFieldIds) ? props.badgeFieldIds : undefined;
  return (
    <DetailHeaderBlock
      testID={b.id}
      state={etat}
      title={value(props.titleFieldId)}
      subtitle={
        props.subtitleFieldId === undefined ? undefined : value(props.subtitleFieldId)
      }
      badges={badgeIds?.map((id) => value(id))}
      trailing={
        props.trailingFieldId === undefined ? undefined : value(props.trailingFieldId)
      }
    />
  );
}

export function AirList({ screen, blockId }: BlockRef) {
  const visible = useBlockVisible(screen, blockId);
  const b = block(screen, blockId);
  // Props SURCHARGÉES par les sorties des slots liés (1.3.0, D-058).
  const props = useBlockProps(screen, blockId);
  const provider = useDataProvider();
  const statut = useDataStatus(b.entityId);
  const onItemNavigate = useItemNavigate(screen, blockId);
  if (!visible) return null;
  if (b.entityId === undefined) throw new Error(`AIR_RUNTIME_ENTITY_MISSING:${blockId}`);
  const titleFieldId = str(props.titleFieldId);
  if (titleFieldId === undefined) {
    throw new Error(`AIR_RUNTIME_PROP_MISSING:${blockId}:titleFieldId`);
  }
  const instances = provider.listInstances(b.entityId);
  const pick = (fieldId: unknown, values: Readonly<Record<string, string>>) =>
    typeof fieldId === "string" ? values[fieldId] : undefined;
  const items: ListItemData[] = instances.map((instance) => ({
    id: instance.id,
    title: instance.values[titleFieldId] ?? "",
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
      onItemPress={onItemNavigate}
    />
  );
}

export function AirForm({ screen, blockId }: BlockRef) {
  const visible = useBlockVisible(screen, blockId);
  const b = block(screen, blockId);
  // Props SURCHARGÉES par les sorties des slots liés (1.3.0, D-058).
  const props = useBlockProps(screen, blockId);
  const dispatch = useDispatch(screen);
  const statut = useDataStatus(b.entityId);
  const [values, setValues] = useState<Readonly<Record<string, string>>>({});
  if (!visible) return null;
  if (b.entityId === undefined) throw new Error(`AIR_RUNTIME_ENTITY_MISSING:${blockId}`);
  const fieldsById = new Map(
    (screen.entities[b.entityId]?.fields ?? []).map((f) => [f.id, f]),
  );
  const fieldIds = Array.isArray(props.fieldIds) ? props.fieldIds : [];
  // Lecture D-028 : l'AIR v1 ne porte pas de libellés humains de champs —
  // le libellé rendu est `field.name` (donnée AIR), jamais un texte moteur.
  const fields: FormFieldSpec[] = fieldIds.flatMap((fieldId) => {
    if (typeof fieldId !== "string") return [];
    const field = fieldsById.get(fieldId);
    return field === undefined ? [] : [{ id: field.id, label: field.name }];
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
      onChangeField={(fieldId, value) =>
        setValues((prev) => ({ ...prev, [fieldId]: value }))
      }
      submitLabel={submitLabel}
      onSubmit={() => dispatch(actionId)}
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
