// ROUTEUR OTA / REBUILD NATIF — Phase 11.
//
// Une mise à jour livrée « over the air » ne remplace que du JavaScript. Tout
// ce qui touche au BINAIRE — une capability qui embarque un module natif, une
// permission, un plancher d'OS, une version de SDK — exige un rebuild et un
// nouveau passage en store. Livrer en OTA un changement de cette nature produit
// une application qui plante à l'ouverture chez l'utilisateur.
//
// Ce module tranche, entre deux versions d'un document, ce qui est livrable et
// ce qui ne l'est pas. Il est PUR : aucun réseau, aucune horloge.
//
// 🔴 FAIL-CLOSED, sans exception : un changement que le routeur ne SAIT PAS
// classer impose le REBUILD. Le défaut inverse — présumer OTA — casse des
// applications déjà installées, chez des gens, sans retour arrière possible.
import { createHash } from "node:crypto";
import { canonicalJson, type ProjectAir } from "@deribfy/air-schema";
import { CAPABILITIES } from "@deribfy/capability-registry";
import { RELEASE_TRAIN_V1, type ReleaseTrain } from "@deribfy/compiler";

/** Profils de runtime versionnés — ordre CROISSANT de surface native. */
export const RUNTIME_PROFILES = ["core", "standard", "extended"] as const;
export type RuntimeProfile = (typeof RUNTIME_PROFILES)[number];

export interface NativeSurface {
  /** Empreinte de TOUT ce qui exige un binaire neuf. */
  readonly fingerprint: string;
  readonly profile: RuntimeProfile;
  readonly capabilities: readonly string[];
  readonly permissions: readonly string[];
  readonly nativeModules: readonly string[];
  readonly minOs: Readonly<{ ios: string; android: number }>;
  readonly trainId: string;
}

/**
 * Surface NATIVE d'un document : ce qui, s'il change, impose un rebuild.
 *
 * Le profil est le PLUS PETIT qui accepte toutes les capabilities demandées —
 * une application qui n'en demande aucune reste en `core`, et n'embarque donc
 * aucun module natif optionnel.
 */
export function nativeSurface(air: ProjectAir, train: ReleaseTrain = RELEASE_TRAIN_V1): NativeSurface {
  const capabilities = [...air.capabilities.map((c) => c.capability)].sort();
  const permissions = [...air.permissions.map((p) => `${p.platform}:${p.permission}`)].sort();

  const modules = new Set<string>();
  let ios = air.native.minIosVersion;
  let android = air.native.minAndroidSdk;
  let profileIndex = 0;
  for (const id of capabilities) {
    const def = CAPABILITIES.find((c) => c.id === id);
    if (def === undefined) continue;
    for (const m of def.dependencies.nativeModules) modules.add(m);
    // `implementation.package` est TOUJOURS présent au registre gelé : la garde
    // d'absence était morte, et une garde morte fait croire à une incertitude
    // qui n'existe pas.
    modules.add(def.implementation.package);
    // Le registre TYPE ces planchers comme optionnels : une capability peut ne
    // pas en déclarer. On garde alors celui du document — présumer une valeur
    // inventerait une contrainte que personne n'a écrite.
    const capIos = def.platforms.ios.minOsVersion ?? ios;
    const capAndroid = def.platforms.android.minSdk ?? android;
    if (capIos > ios) ios = capIos;
    if (capAndroid > android) android = capAndroid;
    // Le profil retenu est le plus BAS que la capability accepte ; le document
    // prend ensuite le MAXIMUM sur toutes ses capabilities.
    const bas = RUNTIME_PROFILES.findIndex((p) => def.compatibleRuntimeProfiles.includes(p));
    if (bas > profileIndex) profileIndex = bas;
  }

  const nativeModules = [...modules].sort();
  const empreinte = {
    capabilities,
    permissions,
    nativeModules,
    minOs: { ios, android },
    // Le train fixe les versions d'Expo, de React Native et du plancher natif :
    // en changer impose un binaire neuf, même sans toucher au document.
    // Le train fixe les planchers de plateforme et la chaîne d'outils : en
    // changer impose un binaire neuf, même sans toucher au document.
    train: { id: train.id, floors: train.platformFloors, toolchain: train.toolchain },
    profile: RUNTIME_PROFILES[profileIndex] ?? "core",
  };
  return {
    fingerprint: createHash("sha256").update(canonicalJson(empreinte)).digest("hex"),
    profile: RUNTIME_PROFILES[profileIndex] ?? "core",
    capabilities,
    permissions,
    nativeModules,
    minOs: { ios, android },
    trainId: train.id,
  };
}

export type RouteKind = "ota" | "rebuild";

export interface RouteVerdict {
  readonly kind: RouteKind;
  /** Pourquoi — jamais un verdict nu. Vide si et seulement si `ota`. */
  readonly reasons: readonly string[];
  readonly before: NativeSurface;
  readonly after: NativeSurface;
}

/**
 * Tranche entre livraison OTA et rebuild natif.
 *
 * Règle unique et vérifiable : **empreinte identique ⇒ OTA ; empreinte
 * différente ⇒ REBUILD**. Les raisons sont nommées une par une, pour qu'un
 * refus soit lisible par celui qui l'encaisse.
 */
export function routeUpdate(
  before: ProjectAir,
  after: ProjectAir,
  trainBefore: ReleaseTrain = RELEASE_TRAIN_V1,
  // DEUX TRAINS, pas un (cas-tueur KT-5) — la première version n'en prenait
  // qu'un, appliqué aux deux côtés : un CHANGEMENT DE PLATEFORME était donc
  // INEXPRIMABLE, et le routeur aurait laissé passer en OTA une montée d'Expo
  // ou de React Native. Le train fait partie de la version livrée, pas du
  // contexte de la comparaison.
  trainAfter: ReleaseTrain = trainBefore,
): RouteVerdict {
  const a = nativeSurface(before, trainBefore);
  const b = nativeSurface(after, trainAfter);
  if (a.fingerprint === b.fingerprint) {
    return { kind: "ota", reasons: [], before: a, after: b };
  }
  const diff = (nom: string, x: readonly string[], y: readonly string[]): string[] => {
    const plus = y.filter((v) => !x.includes(v));
    const moins = x.filter((v) => !y.includes(v));
    const out: string[] = [];
    if (plus.length > 0) out.push(`${nom} ajoutée(s) : ${plus.join(", ")}`);
    if (moins.length > 0) out.push(`${nom} retirée(s) : ${moins.join(", ")}`);
    return out;
  };
  const reasons = [
    ...diff("capability", a.capabilities, b.capabilities),
    ...diff("permission", a.permissions, b.permissions),
    ...diff("module natif", a.nativeModules, b.nativeModules),
  ];
  if (a.minOs.ios !== b.minOs.ios) reasons.push(`plancher iOS ${a.minOs.ios} → ${b.minOs.ios}`);
  if (a.minOs.android !== b.minOs.android) {
    reasons.push(`plancher Android ${String(a.minOs.android)} → ${String(b.minOs.android)}`);
  }
  if (a.profile !== b.profile) reasons.push(`profil de runtime ${a.profile} → ${b.profile}`);
  if (a.trainId !== b.trainId) reasons.push(`train de release ${a.trainId} → ${b.trainId}`);
  // FAIL-CLOSED : l'empreinte diffère mais aucune cause n'a été nommée. On
  // refuse quand même. Un routeur qui laisse passer ce qu'il ne comprend pas
  // n'est pas un routeur, c'est un pari.
  if (reasons.length === 0) {
    reasons.push(
      "empreinte native modifiée sans cause identifiée — REBUILD par défaut (fail-closed)",
    );
  }
  return { kind: "rebuild", reasons, before: a, after: b };
}

export interface OtaAttempt {
  readonly accepted: boolean;
  readonly channel: string;
  readonly reasons: readonly string[];
}

/**
 * Tentative de livraison OTA — le point où le refus se produit RÉELLEMENT.
 *
 * Séparé de `routeUpdate` parce que les deux besoins diffèrent : l'un décide,
 * l'autre AGIT. Un routeur qui ne fait que conseiller serait contournable.
 */
export function attemptOta(
  before: ProjectAir,
  after: ProjectAir,
  channel: string,
  trainBefore: ReleaseTrain = RELEASE_TRAIN_V1,
  trainAfter: ReleaseTrain = trainBefore,
): OtaAttempt {
  const verdict = routeUpdate(before, after, trainBefore, trainAfter);
  return {
    accepted: verdict.kind === "ota",
    channel,
    reasons: verdict.reasons,
  };
}
