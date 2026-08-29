// ORACLE L2 — GÉNÉRATION DE FLOWS E2E DEPUIS L'AIR (6.4, D-034 —
// ARCHITECTURE §9 niveau 2). Fonction PURE : AIR → flows Maestro (YAML)
// couvrant navigation (écran d'entrée + chaque écran atteint par une
// action ui→navigate réelle de l'AIR), états (rendu peuplé = fixtures),
// et RTL (rejeu du parcours sous RTL forcé). Paramètres de défilement
// calibrés pour APPAREIL PHYSIQUE (D-037) : sur un Galaxy A17 réel, le
// défaut par défaut (20 s / vitesse 40) expirait avant d'atteindre le bas
// d'une liste de 24 lignes — FAUX NÉGATIF démontré (les swipes directs y
// parviennent en 1,8 s). Le seuil de visibilité reste à 100 % : le pouvoir
// de détection d'un bloc masqué est INCHANGÉ, seule la patience augmente.
// E2E-agnostique côté blocs :
// les testID sont les identifiants stables de l'AIR (screenId, blockId,
// `<listBlockId>-row-<rowId>`), jamais un texte de langue.
import type { ProjectAir } from "@deribfy/air-schema";

export interface GeneratedFlows {
  /** Parcours de navigation LTR (launch → entrée → chaque nav → retour). */
  readonly navigation: string;
  /** Rejeu du même parcours sous RTL forcé (robustesse de mise en page). */
  readonly rtl: string;
  /** Métadonnées de couverture (pour le rapport). */
  readonly coverage: {
    readonly entryScreenId: string;
    readonly navActions: readonly { blockId: string; targetScreenId: string }[];
    readonly rtlDeclared: boolean;
  };
}

/** Actions ui→navigate déclenchées par un bloc de l'écran d'entrée. */
function entryNavActions(
  air: ProjectAir,
): { blockId: string; targetScreenId: string }[] {
  const entry = air.navigation.entryScreenId;
  const entryBlockIds = new Set(
    air.screens.find((s) => s.id === entry)?.blocks.map((b) => b.id) ?? [],
  );
  const out: { blockId: string; targetScreenId: string }[] = [];
  for (const action of air.actions) {
    if (
      action.trigger.kind === "ui" &&
      entryBlockIds.has(action.trigger.blockId) &&
      action.effect.kind === "navigate"
    ) {
      out.push({ blockId: action.trigger.blockId, targetScreenId: action.effect.screenId });
    }
  }
  return out.sort((a, b) => (a.blockId < b.blockId ? -1 : 1));
}

/** Première ligne de fixture d'un bloc `list` de l'écran d'entrée (état
 *  peuplé rendu), s'il en existe une. */
function firstListRowTestId(air: ProjectAir): string | null {
  const entry = air.navigation.entryScreenId;
  const screen = air.screens.find((s) => s.id === entry);
  const list = screen?.blocks.find((b) => b.blockType === "list");
  if (list?.entityId === undefined) return null;
  return `${list.id}-row-${list.entityId}_row_1`;
}

export type DevicePlatform = "android" | "ios";

// Geste de RETOUR par plateforme (E2E-agnostique, sans texte de langue) :
// Android a un back système ; iOS n'en a pas → pop par geste de bord
// (leçon 3.4/4.7). Le flow reste GÉNÉRÉ depuis l'AIR ; seul le geste
// natif s'adapte à la cible.
function backStep(platform: DevicePlatform): string {
  return platform === "android"
    ? "- back"
    : "- swipe:\n    start: 1%, 50%\n    end: 90%, 50%\n    duration: 400";
}

export function generateMaestroFlows(
  air: ProjectAir,
  appId: string,
  platform: DevicePlatform = "android",
): GeneratedFlows {
  const entry = air.navigation.entryScreenId;
  const navs = entryNavActions(air);
  const firstRow = firstListRowTestId(air);
  const rtlDeclared = air.app.locales.rtlSupported;
  const back = backStep(platform);

  const header = (title: string): string[] => [
    `# GÉNÉRÉ DEPUIS L'AIR (${air.projectId}) — ${title}. NE PAS ÉDITER.`,
    `appId: ${appId}`,
    "---",
    "- launchApp",
    `- assertVisible:\n    id: "${entry}"`,
  ];

  // Assertion d'état peuplé (fixtures rendues) sur l'écran d'entrée.
  const stateAssert = firstRow === null ? [] : [`- assertVisible:\n    id: "${firstRow}"`];

  // Un aller-retour par action de navigation de l'écran d'entrée.
  const navSteps = navs.flatMap((n) => [
    `- scrollUntilVisible:\n    element:\n      id: "${n.blockId}"\n    timeout: 60000\n    speed: 70`,
    `- tapOn:\n    id: "${n.blockId}"`,
    `- assertVisible:\n    id: "${n.targetScreenId}"`,
    back,
    `- assertVisible:\n    id: "${entry}"`,
  ]);

  const navigation = [...header("navigation LTR"), ...stateAssert, ...navSteps, ""].join("\n");

  // RTL : relance sous direction forcée, re-assertion du parcours (mise en
  // page en propriétés logiques — robustesse prouvée en 3.2/3.4).
  const rtl = [
    `# GÉNÉRÉ DEPUIS L'AIR — rejeu RTL (rtlSupported=${String(rtlDeclared)}).`,
    `appId: ${appId}`,
    "---",
    "- launchApp:\n    arguments:\n      forceRTL: true",
    `- assertVisible:\n    id: "${entry}"`,
    ...stateAssert,
    ...navs.flatMap((n) => [
      `- scrollUntilVisible:\n    element:\n      id: "${n.blockId}"\n    timeout: 60000\n    speed: 70`,
      `- tapOn:\n    id: "${n.blockId}"`,
      `- assertVisible:\n    id: "${n.targetScreenId}"`,
      back,
      `- assertVisible:\n    id: "${entry}"`,
    ]),
    "",
  ].join("\n");

  return {
    navigation,
    rtl,
    coverage: { entryScreenId: entry, navActions: navs, rtlDeclared },
  };
}
