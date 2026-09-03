// MANIFESTES / PERMISSIONS / CONFIG NATIVE (4.4, D-029 — lecture A3 de
// D-026) : émission d'`app.json` et du manifeste canonique de permissions
// depuis l'AIR et le REGISTRE (agrégation transitive `inducedPermissionsFor`
// de 2.3). AUCUNE implémentation de capability (Phases 5+). Sorties §6 :
// manifestes (permissions), config native (air.native appliqué par
// max(plancher du train, exigence) via expo-build-properties — D-029).
// Textes iOS (NS*UsageDescription) : depuis les raisons LOCALISÉES
// déclarées dans l'AIR (données, jamais texte moteur — F3) ; permission
// induite sans raison déclarée = refus net (défense en profondeur derrière
// validateAirCapabilities).
import { canonicalJson, type ProjectAir } from "@deribfy/air-schema";
import { inducedPermissionsFor } from "@deribfy/capability-registry";
import { EmitError } from "./emit-project.ts";
import type { ReleaseTrain } from "./release-train.ts";

type Localized = readonly { locale: string; text: string }[];

function resolveLocalized(title: Localized, locale: string, where: string): string {
  const exact = title.find((t) => t.locale === locale);
  if (exact !== undefined) return exact.text;
  const base = locale.split("-")[0] ?? locale;
  const prefixed = title.find((t) => t.locale.split("-")[0] === base);
  if (prefixed !== undefined) return prefixed.text;
  throw new EmitError("EMIT_LOCALE_UNRESOLVED", where, locale);
}

// Identité de PREVIEW déterministe (D-013 : preview sous compte Deribfy ;
// l'identité BYO arrive en Phase 12 par le canal App Identity).
export function previewIdentity(slug: string): { ios: string; android: string } {
  const androidLeaf = (/^[0-9]/.test(slug) ? "x" : "") + slug.replace(/-/g, "_");
  return {
    ios: `com.deribfy.preview.${slug}`,
    android: `com.deribfy.preview.${androidLeaf}`,
  };
}

const versionGte = (a: string, b: string): boolean => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
};

export function emitAppJson(air: ProjectAir, train: ReleaseTrain): string {
  const locale = air.app.locales.defaultAppLocale;
  const capabilityIds = air.capabilities.map((c) => c.capability);
  const induced = inducedPermissionsFor(capabilityIds);
  const identity = previewIdentity(air.app.slug);

  // Textes d'usage iOS depuis les raisons déclarées de l'AIR.
  const declaredByKey = new Map(
    air.permissions
      .filter((p) => p.platform === "ios")
      .map((p) => [p.permission, p]),
  );
  const infoPlist: Record<string, string> = {};
  for (const permission of induced.filter((p) => p.platform === "ios")) {
    const declared = declaredByKey.get(permission.permission);
    if (declared === undefined) {
      throw new EmitError(
        "EMIT_PERMISSION_REASON_MISSING",
        `permissions.${permission.permission}`,
        permission.requiredByCapability,
      );
    }
    infoPlist[permission.permission] = resolveLocalized(
      declared.reason,
      locale,
      `permissions.${permission.permission}`,
    );
  }

  const androidPermissions = induced
    .filter((p) => p.platform === "android")
    .map((p) => p.permission);

  // native.minAndroidSdk / minIosVersion sont REQUIS par le schéma AIR
  // (fait vérifié — le lint type-checked l'a démontré) : pas de repli.
  const minSdkVersion = Math.max(
    train.platformFloors.androidMinSdk,
    air.native.minAndroidSdk,
  );
  const deploymentTarget = versionGte(
    train.platformFloors.iosDeploymentTarget,
    air.native.minIosVersion,
  )
    ? train.platformFloors.iosDeploymentTarget
    : air.native.minIosVersion;

  const expo: Record<string, unknown> = {
    android: {
      package: identity.android,
      permissions: androidPermissions,
      predictiveBackGestureEnabled: false,
      // DET-016 (D-039, dimension A étendue) : pendant ANDROID de
      // l'ajustement clavier. `automaticallyAdjustKeyboardInsets` est
      // iOS-seulement — VÉRIFIÉ sur RN 0.86.3, déclarée dans
      // `ScrollViewPropsIOS`, aucune implémentation Android. Android exige
      // donc que la FENÊTRE se redimensionne à l'apparition du clavier,
      // faute de quoi le contenu est simplement recouvert. Déclaré ici, au
      // manifeste (territoire D-029), et non dans le code : le code généré
      // reste identique sur les deux plateformes, sans `Platform.OS`.
      softwareKeyboardLayoutMode: "resize",
    },
    ios: {
      bundleIdentifier: identity.ios,
      supportsTablet: false,
      ...(Object.keys(infoPlist).length > 0 ? { infoPlist } : {}),
    },
    name: air.app.name,
    newArchEnabled: true,
    orientation: "portrait",
    plugins: [
      [
        "expo-build-properties",
        {
          android: { minSdkVersion },
          ios: { deploymentTarget },
        },
      ],
    ],
    // deep links : schéma émis ssi la capability est déclarée (D-029).
    ...(capabilityIds.includes("deep_links") ? { scheme: air.app.slug } : {}),
    slug: air.app.slug,
    userInterfaceStyle: "light",
    version: "1.0.0",
  };
  return canonicalJson({ expo }) + "\n";
}

// Manifeste CANONIQUE de permissions — artefact d'audit consommé par
// l'Oracle (§9 : diff permissions/manifestes vs AIR) et le Compliance
// Generator (§18, Phase 12 — purposeKeys).
export function emitPermissionsManifest(air: ProjectAir): string {
  const capabilityIds = air.capabilities.map((c) => c.capability);
  const manifest = {
    declared: [...air.permissions]
      .map((p) => ({
        permission: p.permission,
        platform: p.platform,
        reason: p.reason,
        requiredByCapability: p.requiredByCapability,
      }))
      .sort((a, b) =>
        a.platform === b.platform
          ? a.permission < b.permission
            ? -1
            : 1
          : a.platform < b.platform
            ? -1
            : 1,
      ),
    induced: inducedPermissionsFor(capabilityIds),
    native: air.native,
  };
  return canonicalJson(manifest) + "\n";
}
