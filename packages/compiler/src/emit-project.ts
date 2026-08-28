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
import { emitAppJson, emitPermissionsManifest } from "./emit-manifests.ts";
import { EMBEDDED_ASSETS } from "./embedded-assets.generated.ts";
import { resolveLock } from "./resolve-lock.ts";
import { RELEASE_TRAIN_V1, type ReleaseTrain } from "./release-train.ts";

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
      props: Record<string, unknown>;
    }[];
    actions: Record<string, { kind: string; screenId?: string }>;
    uiActionsByBlock: Record<string, string>;
    entities: Record<string, { fields: readonly { id: string; name: string; type: string }[] }>;
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

  // Actions référencées par l'écran : déclencheurs UI + actionId de props.
  const referenced = new Set(Object.values(uiActionsByBlock));
  for (const block of screen.blocks) {
    const props = flatToRecord(block.props);
    const actionId = props.actionId;
    if (typeof actionId === "string") referenced.add(actionId);
  }
  const actions: Record<string, { kind: string; screenId?: string }> = {};
  for (const action of air.actions) {
    if (!referenced.has(action.id)) continue;
    actions[action.id] =
      action.effect.kind === "navigate"
        ? { kind: "navigate", screenId: action.effect.screenId }
        : { kind: action.effect.kind };
  }

  // Tranche d'entités référencées par les blocs de l'écran.
  const entities: ScreenSlice["data"]["entities"] = {};
  for (const block of screen.blocks) {
    if (block.entityId === undefined || entities[block.entityId] !== undefined) continue;
    const entity = air.entities.find((e) => e.id === block.entityId);
    if (entity === undefined) {
      throw new EmitError("EMIT_ENTITY_MISSING", `${where}.${block.id}`, block.entityId);
    }
    entities[block.entityId] = {
      fields: entity.fields.map((f) => ({ id: f.id, name: f.name, type: f.type })),
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
        props: flatToRecord(b.props),
      })),
      actions,
      uiActionsByBlock,
      entities,
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

function emitScreen(slice: ScreenSlice): string {
  const screenId = assertId(slice.screen.id, "screens");
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
  const usesRoute = slice.screen.blocks.some((b) => b.blockType === "detail_header");
  const lines = [
    "// GÉNÉRÉ — NE PAS ÉDITER (code structurel d'écran : ScreenShell + blocs,",
    "// contrainte 3.4 ; les points d'insertion de Code Slots arrivent en Phase 9).",
    'import { ScreenShell } from "../lib/primitives";',
    `import { ${wrappers.join(", ")} } from "../lib/runtime/air-runtime";`,
    ...(usesRoute ? ['import type { AirScreenProps } from "../lib/runtime/air-runtime";'] : []),
    `import { screenData } from "./${screenId}.data";`,
    "",
    usesRoute
      ? `export default function ${pascal(screenId)}Screen({ route }: AirScreenProps) {`
      : `export default function ${pascal(screenId)}Screen() {`,
    "  return (",
    `    <ScreenShell testID="${screenId}" title={screenData.title}>`,
    ...slice.screen.blocks.map((b) => {
      const wrapper = WRAPPER_BY_BLOCK_TYPE[b.blockType] ?? "";
      const itemId = b.blockType === "detail_header" ? " itemId={route?.params?.itemId}" : "";
      return `      <${wrapper} screen={screenData} blockId="${assertId(b.id, screenId)}"${itemId} />`;
    }),
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
  const nav = {
    entryScreenId: assertId(air.navigation.entryScreenId, "navigation"),
    locale,
    routes,
  };
  return [
    "// GÉNÉRÉ — NE PAS ÉDITER (données canoniques de navigation).",
    `export const navData = ${canonicalJson(nav)} as const;`,
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

function emitApp(): string {
  return [
    "// GÉNÉRÉ — NE PAS ÉDITER (racine d'app : thème + données + navigation).",
    "// S7 (D-026) : tokens scellés 1.0.0, design.theme transporté sans effet.",
    "// 4.5 remplacera EMPTY_DATA_PROVIDER par le provider demo déterministe.",
    'import { ThemeRoot } from "./lib/primitives";',
    'import { DataRoot, EMPTY_DATA_PROVIDER } from "./lib/runtime/data-provider";',
    'import { Navigation } from "./navigation";',
    "",
    "export default function App() {",
    "  return (",
    "    <ThemeRoot>",
    "      <DataRoot provider={EMPTY_DATA_PROVIDER}>",
    "        <Navigation />",
    "      </DataRoot>",
    "    </ThemeRoot>",
    "  );",
    "}",
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
): EmittedProject {
  const lock = resolveLock(input, train);
  // Le parse a réussi dans resolveLock — re-parse impossible à échouer ici.
  const air = input as ProjectAir;
  const locale = air.app.locales.defaultAppLocale;

  const files = new Map<string, string>();
  for (const [target, content] of Object.entries(EMBEDDED_ASSETS)) {
    files.set(target, content);
  }
  files.set("App.tsx", emitApp());
  files.set("app.json", emitAppJson(air, train));
  files.set("manifests/permissions.manifest.json", emitPermissionsManifest(air));
  files.set("nav.data.ts", emitNavData(air, locale));
  files.set("navigation.tsx", emitNavigation(air));
  for (const screen of [...air.screens].sort((a, b) => byCodeUnit(a.id, b.id))) {
    const slice = buildScreenSlice(air, screen, locale);
    files.set(`screens/${screen.id}.data.ts`, emitScreenData(slice));
    files.set(`screens/${screen.id}.tsx`, emitScreen(slice));
  }
  return { lock, files };
}
