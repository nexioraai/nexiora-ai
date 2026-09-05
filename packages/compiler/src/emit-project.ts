// ÉMETTEUR DE PROJET (4.3, D-026 Option C / D-028) — AIR validé → fichiers
// du projet généré : App, navigation (verdict S1 : native-stack, config
// explicite), écrans (code STRUCTUREL : ScreenShell obligatoire — leçon
// 3.4 — + séquence de blocs lisible), modules de données CANONIQUES
// (sérialiseur prouvé), copies embarquées (blocs/primitives/tokens/runtime,
// D-007). Fonction PURE : zéro fs/réseau/horloge — les copies viennent du
// module généré `embedded-assets.generated.ts` (non-dérive testée).
// Règles d'émission S5 : LF, UTF-8, tri par point de code, AUCUN contenu
// libre interpolé dans le code (identifiants validés par regex ; toute la
// matière variable vit dans les modules .data canoniques).
import { canonicalJson, type ProjectAir, type ProjectLock } from "@deribfy/air-schema";
import { buildDemoFixtures } from "./demo-fixtures.ts";
import { emitAppJson, emitPermissionsManifest } from "./emit-manifests.ts";
import { applyThemeOverrides, emitThemeModule, hasThemeOverrides } from "./emit-theme.ts";
import { EMBEDDED_ASSETS } from "./embedded-assets.generated.ts";
import { normalizeAir, resolveLock } from "./resolve-lock.ts";
import { RELEASE_TRAIN_V1, type ReleaseTrain } from "./release-train.ts";
import type { CibleRemoteResolue } from "./resolve-lock.ts";

// Syntaxe EFFAÇABLE uniquement (pas de parameter properties) : les bancs
// exécutent ces sources sous le strip-only de Node (patron emit-v2.mjs).
export class EmitError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, detail: string) {
    super(`${code}@${path}: ${detail}`);
    this.name = "EmitError";
    this.code = code;
    this.path = path;
  }
}

export interface EmittedProject {
  lock: ProjectLock;
  /** Chemin relatif du projet généré → contenu (LF, UTF-8 sans BOM). */
  files: ReadonlyMap<string, string>;
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const ID_RE = /^[a-z][a-z0-9_]*$/;
const assertId = (id: string, where: string): string => {
  if (!ID_RE.test(id)) throw new EmitError("EMIT_ID_INVALID", where, id);
  return id;
};
const pascal = (id: string): string =>
  id
    .split("_")
    .map((p) => (p.length > 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join("");

type Localized = readonly { locale: string; text: string }[];

function resolveLocalized(title: Localized, locale: string, where: string): string {
  const exact = title.find((t) => t.locale === locale);
  if (exact !== undefined) return exact.text;
  const base = locale.split("-")[0] ?? locale;
  const prefixed = title.find((t) => t.locale.split("-")[0] === base);
  if (prefixed !== undefined) return prefixed.text;
  throw new EmitError("EMIT_LOCALE_UNRESOLVED", where, locale);
}

const flatToRecord = (
  props: readonly { key: string; value: unknown }[] | undefined,
): Record<string, unknown> =>
  Object.fromEntries((props ?? []).map((p) => [p.key, p.value]));

// blockType (registre gelé) → composant du runtime copié.
const WRAPPER_BY_BLOCK_TYPE: Readonly<Record<string, string>> = {
  button: "AirButton",
  detail_header: "AirDetailHeader",
  empty_state: "AirEmptyState",
  form: "AirForm",
  header: "AirHeader",
  list: "AirList",
};

// CODE SLOTS (Phase 9 — ARCHITECTURE §4). Le compilateur reçoit un BUNDLE
// d'implémentations et les émet comme modules du projet, plus un REGISTRE
// typé. Le type est déclaré ici de façon STRUCTURELLE : le compilateur ne
// dépend pas de `@deribfy/slots` (son allowlist de dépendances est un
// cliquet, et la politique AST est l'affaire du gate et de l'Oracle, pas
// du chemin de compilation qui doit rester pur et minimal).
// La conformité de SIGNATURE, elle, est vérifiée par `tsc` sur le projet
// émis (Oracle §9 niveau 1) : le registre importe chaque fonction par son
// nom et conserve son type exact — aucune érasure, aucun `any`.
export interface SlotSource {
  readonly slotId: string;
  readonly source: string;
  readonly authorId: string;
}

export interface EmitOptions {
  /** Implémentations de Code Slots à émettre (défaut : aucune). */
  readonly slots?: readonly SlotSource[];
  /**
   * Substitution de provider par classe canonique (Phase 10, §15) —
   * transportée telle quelle au résolveur. N'affecte QUE le lock : aucun
   * fichier émis ne dépend d'un provider concret en v1 (fait mesuré).
   */
  readonly providerOverrides?: Readonly<Record<string, string>>;
}

function emitSlotRegistry(slots: readonly SlotSource[]): string {
  const imports = slots.map(
    (s) => `import { runSlot as ${pascal(s.slotId)} } from "./${s.slotId}";`,
  );
  // ADAPTATION DE SIGNATURE (D-069) — défaut RÉEL trouvé en compilant l'app
  // émise : un slot déclare ses entrées PRÉCISES (`{lignes, devise}`), et
  // TypeScript refuse d'assigner une telle fonction à un registre dont les
  // entrées sont `Record<string, unknown>` — la contravariance des paramètres
  // l'interdit. **Toute application portant un slot échouait au `tsc` de son
  // propre projet**, donc au pipeline. Aucun test du moteur ne le voyait :
  // ils vérifiaient le TEXTE émis, jamais qu'il COMPILE.
  //
  // L'adaptateur convertit au point d'appel, une fois, explicitement. La
  // conformité des ports n'est pas perdue : elle est vérifiée par le
  // VALIDATEUR (`AIR_SLOT_INPUT_UNBOUND`, `AIR_SLOT_INPUT_UNKNOWN`), qui refuse
  // un document dont la liaison ne couvre pas exactement les entrées du slot.
  const entries = slots.map(
    (s) =>
      `  ${s.slotId}: (entrees: Readonly<Record<string, unknown>>) =>\n` +
      `    ${pascal(s.slotId)}(entrees as never),`,
  );
  return [
    "// GÉNÉRÉ — NE PAS ÉDITER (registre des Code Slots, Phase 9 / §4).",
    "// Chaque slot garde SA signature dans son propre module ; le registre",
    "// l'adapte au contrat uniforme du runtime. La conformité des ports est",
    "// vérifiée par le VALIDATEUR AIR, pas par cette frontière.",
    ...imports,
    "",
    "export const slotRegistry = {",
    ...entries,
    "} as const;",
    "",
    "export type SlotRegistry = typeof slotRegistry;",
    "",
  ].join("\n");
}

interface ScreenSlice {
  screen: ProjectAir["screens"][number];
  title: string;
  data: {
    screenId: string;
    title: string;
    blocks: readonly {
      id: string;
      blockType: string;
      entityId?: string;
      visibleWhen?: { kind: string; entityId: string };
      props: Record<string, unknown>;
    }[];
    actions: Record<
      string,
      {
        kind: string;
        screenId?: string;
        capability?: string;
        method?: string;
        params?: Record<string, unknown>;
        entityId?: string;
        operation?: string;
        thenScreenId?: string;
      }
    >;
    uiActionsByBlock: Record<string, string>;
    lifecycle?: { onOpen?: readonly string[]; onClose?: readonly string[] };
    rules?: {
      entityId: string;
      assertions: readonly { fieldId: string; operator: string; value?: unknown }[];
    }[];
    slotInvocations?: {
      slotId: string;
      inputs: readonly { port: string; source: unknown }[];
      outputs: readonly { port: string; blockId: string; prop: string }[];
    }[];
    entities: Record<
      string,
      {
        fields: readonly {
          id: string;
          name: string;
          type: string;
          referencesEntityId?: string;
          referenceDisplayFieldId?: string;
        }[];
      }
    >;
  };
}

function buildScreenSlice(air: ProjectAir, screen: ProjectAir["screens"][number], locale: string): ScreenSlice {
  const where = `screens.${screen.id}`;
  const blockIds = new Set(screen.blocks.map((b) => b.id));

  // Actions UI ciblant un bloc de CET écran — ambiguïté = refus net
  // (comportement non spécifié par l'AIR ; corpus v2 mesuré : 0 cas).
  const uiActionsByBlock: Record<string, string> = {};
  for (const action of [...air.actions].sort((a, b) => byCodeUnit(a.id, b.id))) {
    if (action.trigger.kind === "ui" && blockIds.has(action.trigger.blockId)) {
      const existing = uiActionsByBlock[action.trigger.blockId];
      if (existing !== undefined) {
        throw new EmitError(
          "EMIT_UI_ACTION_AMBIGUOUS",
          `${where}.${action.trigger.blockId}`,
          `${existing} et ${action.id}`,
        );
      }
      uiActionsByBlock[action.trigger.blockId] = action.id;
    }
  }

  // CYCLE DE VIE (D-068) — actions `lifecycle` visant CET écran. `screenId`
  // absent = l'action vaut pour l'application entière : on ne l'attache alors
  // qu'à l'écran d'entrée, pour qu'elle s'exécute UNE fois et non à chaque écran.
  const entree = air.navigation.entryScreenId;
  const cycleDe = (event: string): string[] =>
    air.actions
      .filter(
        (a) =>
          a.trigger.kind === "lifecycle" &&
          a.trigger.event === event &&
          (a.trigger.screenId === undefined ? screen.id === entree : a.trigger.screenId === screen.id),
      )
      .map((a) => a.id)
      .sort(byCodeUnit);
  const onOpen = [...cycleDe("screen_open"), ...cycleDe("app_start")];
  const onClose = cycleDe("screen_close");

  // Actions référencées par l'écran : déclencheurs UI + actionId de props.
  const referenced = new Set(Object.values(uiActionsByBlock));
  // D-068 : sans cela, le dispatcher ne trouverait pas l'effet d'une action de
  // cycle de vie et l'appel serait silencieusement sans objet.
  for (const id of [...onOpen, ...onClose]) referenced.add(id);
  for (const block of screen.blocks) {
    const props = flatToRecord(block.props);
    const actionId = props.actionId;
    if (typeof actionId === "string") referenced.add(actionId);
  }
  const actions: ScreenSlice["data"]["actions"] = {};
  for (const action of air.actions) {
    if (!referenced.has(action.id)) continue;
    if (action.effect.kind === "navigate") {
      actions[action.id] = { kind: "navigate", screenId: action.effect.screenId };
    } else if (action.effect.kind === "mutation") {
      // D-061 : l'entité et l'opération sont TRANSPORTÉES jusqu'au runtime.
      actions[action.id] = {
        kind: "mutation",
        entityId: action.effect.entityId,
        operation: action.effect.operation,
        ...(action.effect.thenScreenId === undefined
          ? {}
          : { thenScreenId: action.effect.thenScreenId }),
      };
    } else if (action.effect.kind === "capability") {
      // D-059 : la capability, sa méthode et ses paramètres sont TRANSPORTÉS
      // jusqu'au runtime. Sans eux, le dispatcher n'avait rien à présenter au
      // fournisseur — l'effet ne pouvait qu'être avalé.
      actions[action.id] = {
        kind: "capability",
        capability: action.effect.capability,
        method: action.effect.method,
        params: flatToRecord(action.effect.params),
      };
    } else {
      actions[action.id] = { kind: action.effect.kind };
    }
  }

  // INVOCATIONS DE SLOTS (1.3.0, D-058) — un slot lié appartient à CET écran si
  // au moins une de ses sorties alimente un bloc de cet écran. Règle
  // STRUCTURELLE, pas une devinette sur le déclencheur : c'est la sortie qui dit
  // où le résultat est utile, donc où le calcul doit avoir lieu.
  const slotInvocations: NonNullable<ScreenSlice["data"]["slotInvocations"]> = [];
  for (const action of [...air.actions].sort((a, b) => byCodeUnit(a.id, b.id))) {
    if (action.effect.kind !== "slot" || action.effect.binding === undefined) continue;
    const outputs = action.effect.binding.outputs.filter((o) => blockIds.has(o.blockId));
    if (outputs.length === 0) continue;
    slotInvocations.push({
      slotId: action.effect.slotId,
      inputs: action.effect.binding.inputs.map((b) => ({ port: b.port, source: b.source })),
      outputs: outputs.map((o) => ({ port: o.port, blockId: o.blockId, prop: o.prop })),
    });
  }


  // RÈGLES applicables (D-062) : `air.rules` n'était lu par AUCUN étage
  // d'émission. On ne transporte que celles des entités qu'une action de cet
  // écran peut écrire — pas tout le document.
  const ecritesIci = new Set(
    Object.values(uiActionsByBlock)
      .map((id) => air.actions.find((a) => a.id === id))
      .filter((a) => a?.effect.kind === "mutation")
      .map((a) => (a?.effect as { entityId: string }).entityId),
  );
  const reglesEcran = air.rules
    .filter((r) => r.kind === "validation" && ecritesIci.has(r.entityId))
    .map((r) => ({
      entityId: r.entityId,
      assertions: r.assertions.map((a) => ({
        fieldId: a.fieldId,
        operator: a.operator,
        ...(a.value === undefined ? {} : { value: a.value }),
      })),
    }));

  // Tranche d'entités référencées par les blocs de l'écran.
  const entities: ScreenSlice["data"]["entities"] = {};
  for (const block of screen.blocks) {
    if (block.entityId === undefined || entities[block.entityId] !== undefined) continue;
    const entity = air.entities.find((e) => e.id === block.entityId);
    if (entity === undefined) {
      throw new EmitError("EMIT_ENTITY_MISSING", `${where}.${block.id}`, block.entityId);
    }
    entities[block.entityId] = {
      fields: entity.fields.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        // TRAVERSÉE DE RELATION (1.4.0, D-064) : de quoi résoudre l'identifiant
        // brut en une valeur lisible, sans que le runtime ait à deviner.
        ...(f.referencesEntityId === undefined || f.referenceDisplayFieldId === undefined
          ? {}
          : {
              referencesEntityId: f.referencesEntityId,
              referenceDisplayFieldId: f.referenceDisplayFieldId,
            }),
      })),
    };
  }

  return {
    screen,
    title: resolveLocalized(screen.title, locale, where),
    data: {
      screenId: screen.id,
      title: resolveLocalized(screen.title, locale, where),
      blocks: screen.blocks.map((b) => ({
        id: b.id,
        blockType: b.blockType,
        ...(b.entityId === undefined ? {} : { entityId: b.entityId }),
        // Condition de rendu (AIR 1.1.0) : transportée telle quelle dans les
        // données canoniques — absente = bloc toujours visible, donc les
        // documents 1.0.0 migrés gardent EXACTEMENT leur comportement.
        ...(b.visibleWhen === undefined ? {} : { visibleWhen: b.visibleWhen }),
        props: flatToRecord(b.props),
      })),
      actions,
      uiActionsByBlock,
      entities,
      // Omise quand vide : les documents sans liaison de slot gardent des
      // données d'écran EXACTEMENT identiques à celles de 1.2.0.
      ...(slotInvocations.length === 0 ? {} : { slotInvocations }),
      // RÈGLES (D-062) : celles des entités que CET écran peut écrire. Omises
      // quand aucune ne s'applique — les documents sans règle sont inchangés.
      ...(reglesEcran.length === 0 ? {} : { rules: reglesEcran }),
      ...(onOpen.length === 0 && onClose.length === 0
        ? {}
        : {
            lifecycle: {
              ...(onOpen.length === 0 ? {} : { onOpen }),
              ...(onClose.length === 0 ? {} : { onClose }),
            },
          }),
    },
  };
}

function emitScreenData(slice: ScreenSlice): string {
  return [
    "// GÉNÉRÉ — NE PAS ÉDITER (données canoniques d'écran, D-026 Option C).",
    'import type { AirScreenData } from "../lib/runtime/air-runtime";',
    "",
    `export const screenData: AirScreenData = ${canonicalJson(slice.data)};`,
    "",
  ].join("\n");
}

function emitScreen(slice: ScreenSlice, aBarre: boolean): string {
  const screenId = assertId(slice.screen.id, "screens");
  // D-086 : la barre est rendue par CHAQUE écran, en DERNIÈRE position dans la
  // coquille. Un bloc l'aurait placée dans le corps — répétée ou oubliée selon
  // ce que le document déclare. Ici elle est structurelle.
  // D-068 : cet écran porte-t-il des actions de cycle de vie ?
  const aCycle = slice.data.lifecycle !== undefined;
  const wrappers = [
    ...new Set(
      slice.screen.blocks.map((b) => {
        const wrapper = WRAPPER_BY_BLOCK_TYPE[b.blockType];
        if (wrapper === undefined) {
          throw new EmitError("EMIT_BLOCK_TYPE_UNKNOWN", `screens.${screenId}.${b.id}`, b.blockType);
        }
        return wrapper;
      }),
    ),
  ].sort(byCodeUnit);
  // E2 (D-129) — les listes reçoivent aussi l'instance courante : une liste
  // scopée sans elle est VIDE (jamais rows[0]), le pipeline pur en décide.
  const usesRoute = slice.screen.blocks.some(
    (b) => b.blockType === "detail_header" || b.blockType === "list",
  );
  // DET-006 (D-039) : un écran porteur d'un bloc `list` N'EST PLUS enveloppé
  // dans un ScrollView. Cause démontrée : une FlatList imbriquée dans un
  // ScrollView de même axe reçoit une hauteur NON BORNÉE et rend tous ses
  // éléments — virtualisation neutralisée. La liste redevient donc le
  // défileur de l'écran (Section `fill` la borne), les blocs voisins
  // devenant des régions fixes. Effet secondaire favorable : les contrôles
  // post-liste restent toujours atteignables (dimension A de la grille).
  const hasList = slice.screen.blocks.some((b) => b.blockType === "list");
  // DET-030 (jugement propriétaire sur SM-A175F, 2026-09-05) : le clavier
  // RECOUVRAIT les champs de formulaire sur Android. Cause démontrée par
  // recoupement : DET-016 confiait Android à `softwareKeyboardLayoutMode:
  // "resize"` (manifeste), or la fenêtre est BORD À BORD (D-037) et Android
  // 15+ ignore le redimensionnement en bord à bord — la déclaration était
  // inerte, précisément sur l'appareil de référence. Le mécanisme devient
  // KeyboardAvoidingView `padding`, identique sur les deux plateformes
  // (aucun Platform.OS, verrou 4) ; `automaticallyAdjustKeyboardInsets`
  // QUITTE ces écrans — le cumul aurait compensé DEUX fois sur iOS. La
  // FlatList du bloc list, elle, conserve son ajustement (verrou 2).
  const containerImport = hasList ? "View" : "KeyboardAvoidingView, ScrollView";
  const containerOpen = hasList
    ? "      <View style={{ flex: 1, paddingBottom: insets.bottom }}>"
    : '      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>\n' +
      "      <ScrollView\n" +
      "        contentContainerStyle={{ paddingBottom: insets.bottom }}\n" +
      '        keyboardShouldPersistTaps="handled"\n' +
      "      >";
  const containerClose = hasList
    ? "      </View>"
    : "      </ScrollView>\n      </KeyboardAvoidingView>";
  const lines = [
    "// GÉNÉRÉ — NE PAS ÉDITER (code structurel d'écran : ScreenShell + blocs,",
    "// contrainte 3.4 ; les points d'insertion de Code Slots arrivent en Phase 9).",
    "// DÉFILEMENT (D-031-R47 puis DET-006/D-039) : un écran SANS bloc list",
    "// reste une page défilante ; un écran AVEC bloc list confie le",
    "// défilement à la liste virtualisée elle-même, bornée par Section fill.",
    "// SAFE AREA DU BAS (D-037) : défaut DÉMONTRÉ sur appareil physique",
    "// (Galaxy A17 / Android 16) — la fenêtre est bord à bord, donc le",
    "// DERNIER bloc était rendu sous la barre de navigation gestuelle et",
    "// restait inatteignable. Le contenu défilant est décalé de l'inset bas",
    "// réel. `useSafeAreaInsets` est disponible sans SafeAreaProvider ajouté :",
    "// NativeStackView enveloppe déjà ses écrans dans SafeAreaProviderCompat",
    "// [vérifié dans le paquet installé].",
    `import { ${containerImport} } from "react-native";`,
    'import { useSafeAreaInsets } from "react-native-safe-area-context";',
    'import { ScreenShell } from "../lib/primitives";',
    `import { ${[...wrappers, ...(aCycle ? ["AirScreenLifecycle"] : [])].sort().join(", ")} } from "../lib/runtime/air-runtime";`,
    ...(aBarre
      ? [
          'import { PrimaryNav } from "../lib/runtime/primary-nav";',
          'import { primaryNav } from "../nav.data";',
        ]
      : []),
    ...(usesRoute ? ['import type { AirScreenProps } from "../lib/runtime/air-runtime";'] : []),
    `import { screenData } from "./${screenId}.data";`,
    "",
    usesRoute
      ? `export default function ${pascal(screenId)}Screen({ route }: AirScreenProps) {`
      : `export default function ${pascal(screenId)}Screen() {`,
    "  const insets = useSafeAreaInsets();",
    "  return (",
    `    <ScreenShell testID="${screenId}" title={screenData.title}>`,
    // D-068 : composant SANS RENDU, monté en tête d'écran. Il exécute les
    // actions d'ouverture au montage et celles de sortie au démontage.
    ...(aCycle ? ["      <AirScreenLifecycle screen={screenData} />"] : []),
    containerOpen,
    ...slice.screen.blocks.map((b) => {
      const wrapper = WRAPPER_BY_BLOCK_TYPE[b.blockType] ?? "";
      const itemId =
        b.blockType === "detail_header" || b.blockType === "list"
          ? " itemId={route?.params?.itemId}"
          : "";
      return `        <${wrapper} screen={screenData} blockId="${assertId(b.id, screenId)}"${itemId} />`;
    }),
    containerClose,
    // POSITION STRUCTURELLE (D-086) : la barre est le DERNIER enfant de la
    // coquille, après tout le contenu. Ce n'est pas un style qui la place en
    // bas — c'est l'ORDRE DE L'ARBRE, ce qu'une preuve de rendu peut vérifier
    // sans lire une seule feuille de style.
    ...(aBarre
      ? [`      <PrimaryNav destinations={primaryNav} currentScreenId="${screenId}" />`]
      : []),
    "    </ScreenShell>",
    "  );",
    "}",
    "",
  ];
  return lines.join("\n");
}

function emitNavData(air: ProjectAir, locale: string): string {
  // route.title est OPTIONNEL dans le schéma AIR (fait vérifié, air.ts) :
  // repli déterministe sur le titre de l'ÉCRAN cible (requis, lui).
  const screenTitles = new Map(air.screens.map((s) => [s.id, s.title]));
  const routes = [...air.navigation.routes]
    .sort((a, b) => byCodeUnit(a.screenId, b.screenId))
    .map((r) => {
      const title = r.title ?? screenTitles.get(r.screenId);
      if (title === undefined) {
        throw new EmitError("EMIT_ROUTE_TITLE_MISSING", `navigation.${r.id}`, r.screenId);
      }
      return {
        routeId: assertId(r.id, "navigation.routes"),
        screenId: assertId(r.screenId, "navigation.routes"),
        title: resolveLocalized(title, locale, `navigation.${r.id}`),
      };
    });
  // NAVIGATION PRINCIPALE (D-086) — triée à l'émission ET re-triée au rendu :
  // ce qui est AFFICHÉ respecte l'ordre déclaré même si un étage intermédiaire
  // le réordonnait. Deux gardes valent mieux qu'une promesse.
  const primary =
    air.navigation.primary === undefined
      ? []
      : [...air.navigation.primary.destinations]
          .sort((a, b) => a.order - b.order)
          .map((d) => {
            const route = air.navigation.routes.find((r) => r.id === d.routeId);
            if (route === undefined) {
              throw new EmitError("EMIT_NAV_ROUTE_MISSING", "navigation.primary", d.routeId);
            }
            return {
              routeId: assertId(d.routeId, "navigation.primary"),
              screenId: assertId(route.screenId, "navigation.primary"),
              label: resolveLocalized(d.label, locale, `navigation.primary.${d.routeId}`),
              order: d.order,
              // 1.8.0 — projection EXPLICITE, comme les autres champs : la
              // destination n'est pas recopiée en bloc. Absente du document,
              // la clé reste absente de l'artefact et le runtime ne dessine
              // rien — aucun glyphe par défaut n'est inventé.
              ...(d.icon === undefined ? {} : { icon: d.icon }),
            };
          });
  const nav = {
    entryScreenId: assertId(air.navigation.entryScreenId, "navigation"),
    locale,
    routes,
  };
  return [
    "// GÉNÉRÉ — NE PAS ÉDITER (données canoniques de navigation).",
    `export const navData = ${canonicalJson(nav)} as const;`,
    "",
    "// Destinations principales — vide si le document n'en déclare aucune.",
    `export const primaryNav = ${canonicalJson(primary)} as const;`,
    "",
  ].join("\n");
}

function emitNavigation(air: ProjectAir): string {
  const routes = [...air.navigation.routes].sort((a, b) => byCodeUnit(a.screenId, b.screenId));
  const importLines = routes.map(
    (r) => `import ${pascal(r.screenId)}Screen from "./screens/${assertId(r.screenId, "navigation")}";`,
  );
  const screenLines = routes.flatMap((r) => [
    `      <Stack.Screen name="${r.screenId}" component={${pascal(r.screenId)}Screen}`,
    `        options={{ title: navData.routes.find((x) => x.screenId === "${r.screenId}")!.title }} />`,
  ]);
  return [
    "// GÉNÉRÉ — NE PAS ÉDITER (navigation : verdict S1 D-026 — native-stack,",
    "// config EXPLICITE émise depuis l'AIR, patron prouvé au banc V4).",
    'import { NavigationContainer } from "@react-navigation/native";',
    'import { createNativeStackNavigator } from "@react-navigation/native-stack";',
    'import { navData } from "./nav.data";',
    ...importLines,
    "",
    "const Stack = createNativeStackNavigator();",
    "",
    "export function Navigation() {",
    "  return (",
    "    <NavigationContainer>",
    `      <Stack.Navigator initialRouteName="${assertId(air.navigation.entryScreenId, "navigation")}">`,
    ...screenLines,
    "      </Stack.Navigator>",
    "    </NavigationContainer>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function emitApp(
  air: ProjectAir,
  avecSlots: boolean,
  ciblesRemote: readonly CibleRemoteResolue[] = [],
): string {
  const avecRemote = ciblesRemote.length > 0;
  return [
    "// GÉNÉRÉ — NE PAS ÉDITER (racine d'app : thème + données + navigation).",
    "// S7 (D-026) : tokens scellés 1.0.0, design.theme transporté sans effet.",
    "// Provider demo (D-030) : fixtures déterministes compilées (demo.data).",
    // RTL (D-063) : `app.locales.rtlSupported` n'était lu par AUCUN étage —
    // le drapeau était transporté et sans effet (non-négociable #16 non tenu).
    // Il pilote désormais `I18nManager` de React Native, à la racine de l'app.
    ...(air.app.locales.rtlSupported
      ? ['import { I18nManager } from "react-native";']
      : []),
    'import { ThemeRoot } from "./lib/primitives";',
    'import { DataRoot } from "./lib/runtime/data-provider";',
    'import { FormStateRoot } from "./lib/runtime/form-state";',
    // Provenance distante (E3.3, D-132) : le magasin observable remplace le
    // provider figé UNIQUEMENT quand le document déclare une cible remote —
    // sinon l'app émise reste byte-identique (additivité stricte, patron
    // D-058). L'adaptateur applique les cibles RÉSOLUES PAR LE LOCK sous la
    // politique `network.allowedDomains` (fail-closed).
    ...(avecRemote
      ? [
          'import { creerMagasin } from "./lib/runtime/magasin-donnees";',
          'import {',
          '  creerAdaptateurReseau,',
          '  planificateurIntervalle,',
          '  transportHttp,',
          '} from "./lib/runtime/source-reseau";',
        ]
      : ['import { buildDemoProvider } from "./lib/runtime/demo-provider";']),
    // Registre de slots (1.3.0, D-058) : importé UNIQUEMENT si le projet en
    // embarque — sinon l'app émise resterait identique à 1.2.0 au caractère
    // près, et ce fichier n'a aucune raison de changer.
    ...(avecSlots
      ? [
          'import { SlotRoot } from "./lib/runtime/slot-provider";',
          // Le registre est émis en `slots/index.ts` — pas `slots/registry.ts`.
          // Erreur attrapée par le rendu (observation D-058) : l'app émise
          // n'aurait pas résolu l'import, et aucun test de source ne l'aurait vu.
          'import { slotRegistry } from "./slots";',
        ]
      : []),
    'import { demoData } from "./demo.data";',
    'import { Navigation } from "./navigation";',
    "",
    ...(avecRemote
      ? [
          "// Amorçage : fixtures de démo (D-013) — la source distante les",
          "// remplace dès la première consommation réussie ; en attendant,",
          "// l'état du magasin dit la vérité (loading/error).",
          "const provider = creerMagasin(demoData);",
          `const CIBLES_REMOTE = ${canonicalJson(ciblesRemote)} as const;`,
          `const DOMAINES_AUTORISES = ${canonicalJson(air.network.allowedDomains)} as const;`,
          "// Transport et polling APPAREIL fournis par le runtime embarqué —",
          "// l'adaptateur revérifie chaque hôte contre DOMAINES_AUTORISES.",
          "const adaptateur = creerAdaptateurReseau({",
          "  magasin: provider,",
          "  cibles: CIBLES_REMOTE,",
          "  domainesAutorises: DOMAINES_AUTORISES,",
          "  transport: transportHttp,",
          "  planificateur: planificateurIntervalle,",
          "});",
          "void adaptateur.demarrer();",
        ]
      : ["const provider = buildDemoProvider(demoData);"]),
    ...(air.app.locales.rtlSupported
      ? [
          "",
          "// Le document DÉCLARE le support RTL : on l'active réellement.",
          "I18nManager.allowRTL(true);",
        ]
      : []),
    "",
    "export default function App() {",
    "  return (",
    "    <ThemeRoot>",
    "      <DataRoot provider={provider}>",
    ...(avecSlots
      ? [
          "        <SlotRoot registry={slotRegistry}>",
          "          <FormStateRoot>",
          "            <Navigation />",
          "          </FormStateRoot>",
          "        </SlotRoot>",
        ]
      : ["        <FormStateRoot>", "          <Navigation />", "        </FormStateRoot>"]),
    "      </DataRoot>",
    "    </ThemeRoot>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function emitDemoData(air: ProjectAir): string {
  return [
    "// GÉNÉRÉ — NE PAS ÉDITER (fixtures demo déterministes, D-030 :",
    "// PRNG seedé par le contentHash de chaque dataset — preview = données",
    "// de démo uniquement, D-013).",
    'import type { DemoData } from "./lib/runtime/demo-provider";',
    "",
    `export const demoData: DemoData = ${canonicalJson(buildDemoFixtures(air))};`,
    "",
  ].join("\n");
}

/**
 * AIR (non validé) → lock + fichiers du projet généré. Fail-closed : la
 * résolution du lock (4 validateurs) refuse tout document non conforme
 * AVANT la moindre émission.
 */
export function emitProject(
  input: unknown,
  train: ReleaseTrain = RELEASE_TRAIN_V1,
  options: EmitOptions = {},
): EmittedProject {
  const lock = resolveLock(input, train, {
    ...(options.providerOverrides === undefined ? {} : { providerOverrides: options.providerOverrides }),
  });
  // Le parse a réussi dans resolveLock — re-parse impossible à échouer ici.
  // NORMALISATION : le lock a été calculé sur le document MIGRÉ ; émettre
  // depuis l'entrée brute ferait travailler les deux étages sur deux
  // versions du même document (airHash d'un côté, code de l'autre).
  const air = normalizeAir(input) as ProjectAir;
  const locale = air.app.locales.defaultAppLocale;

  const files = new Map<string, string>();
  for (const [target, content] of Object.entries(EMBEDDED_ASSETS)) {
    files.set(target, content);
  }
  // THÈME PAR APP (v2, P-007) : n'écrase la copie embarquée que si l'AIR
  // demande une identité propre. Sans surcharge, la sortie reste
  // byte-identique à celle d'avant la v2 (additivité stricte, testée).
  if (hasThemeOverrides(air)) {
    const { problems } = applyThemeOverrides(air);
    if (problems.length > 0) {
      const first = problems[0];
      throw new EmitError(
        first?.code ?? "THEME_OVERRIDE_INVALID",
        `design.overrides.${first?.key ?? "?"}`,
        first?.detail ?? "surcharge refusée",
      );
    }
    files.set("lib/tokens/theme.generated.ts", emitThemeModule(air));
  }
  files.set("app.json", emitAppJson(air, train));
  files.set("demo.data.ts", emitDemoData(air));
  files.set("manifests/permissions.manifest.json", emitPermissionsManifest(air));
  files.set("nav.data.ts", emitNavData(air, locale));
  files.set("navigation.tsx", emitNavigation(air));
  for (const screen of [...air.screens].sort((a, b) => byCodeUnit(a.id, b.id))) {
    const slice = buildScreenSlice(air, screen, locale);
    files.set(`screens/${screen.id}.data.ts`, emitScreenData(slice));
    files.set(`screens/${screen.id}.tsx`, emitScreen(slice, air.navigation.primary !== undefined));
  }

  // Code Slots : émission FAIL-CLOSED et déterministe (tri par point de
  // code). Un slot non déclaré par l'AIR, ou déclaré deux fois, est un
  // refus net — le compilateur n'invente jamais un contrat.
  const bundle = [...(options.slots ?? [])].sort((a, b) => byCodeUnit(a.slotId, b.slotId));
  files.set("App.tsx", emitApp(air, bundle.length > 0, lock.resolved.remoteData ?? []));
  if (bundle.length > 0) {
    const declared = new Set(air.slots.map((s) => s.id));
    const seen = new Set<string>();
    for (const impl of bundle) {
      if (!declared.has(impl.slotId)) {
        throw new EmitError("EMIT_SLOT_UNDECLARED", `slots.${impl.slotId}`, "absent des slots de l'AIR");
      }
      if (seen.has(impl.slotId)) {
        throw new EmitError("EMIT_SLOT_DUPLICATE", `slots.${impl.slotId}`, "deux implémentations");
      }
      seen.add(impl.slotId);
      // Source VERBATIM : le compilateur n'altère jamais le code d'un slot
      // (son empreinte reste celle qu'a signée l'auteur et qu'a analysée la
      // politique AST — toute réécriture invaliderait la preuve).
      files.set(`slots/${assertId(impl.slotId, "slots")}.ts`, impl.source);
    }
    files.set("slots/index.ts", emitSlotRegistry(bundle));
  }
  return { lock, files };
}
