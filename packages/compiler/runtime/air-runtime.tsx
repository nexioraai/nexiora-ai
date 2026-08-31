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
import { useMemo } from "react";
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
import { useFormValues } from "./form-state";

export interface AirEffectData {
  kind: "navigate" | "capability" | "mutation" | "slot";
  screenId?: string;
  /** Effet `mutation` (D-061) — l'entité écrite et l'opération. */
  entityId?: string;
  operation?: string;
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

/** Règle de validation (AIR `rules`, D-062) — appliquée AVANT toute écriture. */
export interface AirRuleData {
  entityId: string;
  assertions: readonly {
    fieldId: string;
    operator: string;
    value?: string | number | boolean | null;
  }[];
}

export interface AirFieldData {
  id: string;
  name: string;
  type: string;
  /** Traversée de relation (1.4.0, D-064) — vers quoi, et quoi montrer. */
  referencesEntityId?: string;
  referenceDisplayFieldId?: string;
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
  const condition = block(screen, blockId).visibleWhen;
  if (condition === undefined) return true;
  const vide = provider.listInstances(condition.entityId).length === 0;
  return condition.kind === "entity_empty" ? vide : !vide;
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
    if (cible === undefined || affiche === undefined) return brut;
    return provider.getInstance(cible, brut)?.values[affiche] ?? brut;
  };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function useDispatch(screen: AirScreenData) {
  const navigation = useNavigation();
  const capabilities = useCapabilityProvider();
  const data = useDataProvider();
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
        capabilities.invoke({
          capability: effect.capability,
          method: effect.method ?? "",
          params: effect.params ?? {},
        });
        return;
      }
      // MUTATION (D-061) : l'effet n'est plus une non-opération. L'écriture est
      // présentée au fournisseur de données ; un fournisseur en LECTURE SEULE
      // n'expose pas la méthode et l'appel est simplement absent — jamais un
      // faux succès.
      if (effect?.kind === "mutation" && effect.entityId !== undefined) {
        const cible = effect.entityId;
        const saisie = values ?? {};
        // D-062 : une écriture qui viole une règle déclarée est ANNULÉE.
        if (!reglesRespectees(screen.rules, cible, saisie)) return;
        if (effect.operation === "create") data.create?.(cible, saisie);
        else if (effect.operation === "update") {
          const id = saisie.id;
          if (id !== undefined) data.update?.(cible, id, saisie);
        } else if (effect.operation === "delete") {
          const id = saisie.id;
          if (id !== undefined) data.remove?.(cible, id);
        }
        return;
      }
      // slot : invoqué au RENDU, pas ici.
    },
    [navigation, screen, capabilities, data],
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
  const resoudre = useResolveField(screen, b.entityId);
  const onItemNavigate = useItemNavigate(screen, blockId);
  if (!visible) return null;
  if (b.entityId === undefined) throw new Error(`AIR_RUNTIME_ENTITY_MISSING:${blockId}`);
  const titleFieldId = str(props.titleFieldId);
  if (titleFieldId === undefined) {
    throw new Error(`AIR_RUNTIME_PROP_MISSING:${blockId}:titleFieldId`);
  }
  // TRI / FILTRE / PAGINATION (D-065) — appliqués sur les instances AVANT le
  // rendu. Fermé par construction : trois opérateurs, une direction, une borne.
  // Ordre volontaire : filtrer, puis trier, puis borner — l'inverse tronquerait
  // avant d'avoir vu toutes les lignes.
  const brutes = provider.listInstances(b.entityId);
  const filtreChamp = str(props.filterFieldId);
  const filtreValeur = str(props.filterValue);
  const filtrees =
    filtreChamp === undefined || filtreValeur === undefined
      ? brutes
      : brutes.filter((i) => {
          const v = i.values[filtreChamp] ?? "";
          if (props.filterOperator === "neq") return v !== filtreValeur;
          if (props.filterOperator === "contains") return v.includes(filtreValeur);
          return v === filtreValeur;
        });
  const triChamp = str(props.sortFieldId);
  const triees =
    triChamp === undefined
      ? filtrees
      : [...filtrees].sort((x, y) => {
          const a = x.values[triChamp] ?? "";
          const c = y.values[triChamp] ?? "";
          const na = Number(a);
          const nc = Number(c);
          const ordre =
            Number.isFinite(na) && Number.isFinite(nc) ? na - nc : a.localeCompare(c);
          return props.sortDirection === "desc" ? -ordre : ordre;
        });
  const borne = typeof props.pageSize === "number" ? props.pageSize : undefined;
  const instances = borne === undefined ? triees : triees.slice(0, borne);
  const pick = (fieldId: unknown, values: Readonly<Record<string, string>>) =>
    typeof fieldId === "string" ? resoudre(fieldId, values[fieldId]) : undefined;
  const items: ListItemData[] = instances.map((instance) => ({
    id: instance.id,
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
  // D-066 : l'état vit AU-DESSUS des écrans. Un retour en arrière ne vide plus
  // le formulaire — défaut mesuré sur le parcours de commande.
  const [values, changer] = useFormValues(blockId);
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
      onChangeField={changer}
      submitLabel={submitLabel}
      // D-061 : les valeurs SAISIES accompagnent l'action — sans elles, une
      // création écrirait un enregistrement vide.
      onSubmit={() => dispatch(actionId, values)}
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
