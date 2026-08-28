// ORACLE — NIVEAU 1 DÉTERMINISTE (6.2, D-034 — ARCHITECTURE §9).
// Service SÉPARÉ : il LIT l'AIR et les artefacts du compilateur/provisioner
// et RE-VÉRIFIE tout indépendamment — il ne fait JAMAIS confiance à la
// déclaration du générateur ni à une conversation LLM (§5, §9). Aucune
// autorité LLM à ce niveau. Fonctions PURES, déterministes.
// Contrôles (§9 niveau 1) :
//  1. Déterminisme : recompilation → hash de sortie stable et = attendu ;
//  2. Re-validation fail-closed aux 4 validateurs (schéma, sémantique,
//     capabilities, blocs) ;
//  3. Diff permissions/manifestes vs AIR : app.json émis ⇔ permissions
//     induites recalculées depuis le registre ;
//  4. Cohérence du schéma backend : tables du SQL généré ⇔ entités de l'AIR.
import {
  canonicalJson,
  projectAirSchema,
  sha256Hex,
  validateAir,
  type ProjectAir,
} from "@deribfy/air-schema";
import { inducedPermissionsFor, validateAirCapabilities } from "@deribfy/capability-registry";
import { validateAirBlocks } from "@deribfy/blocks/registry";
import { compileProject, emitAppJson, RELEASE_TRAIN_V1 } from "@deribfy/compiler";
import { generateProvisioningSql } from "@deribfy/provisioner";

export interface OracleCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface OracleVerdict {
  readonly level: 1;
  readonly passed: boolean;
  readonly checks: readonly OracleCheck[];
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Exécute l'Oracle niveau 1 sur un document AIR. `expectedRootHash`, s'il
 * est fourni, est l'artefact enregistré à la compilation : l'Oracle vérifie
 * qu'une recompilation indépendante retombe sur ce hash (déterminisme
 * prouvé côté vérificateur, pas déclaré côté générateur).
 */
export function runOracleLevel1(
  input: unknown,
  expectedRootHash?: string,
): OracleVerdict {
  const checks: OracleCheck[] = [];

  // --- 2. Re-validation fail-closed (avant tout : un AIR non conforme ne
  //        passe aucun autre contrôle).
  const parsed = projectAirSchema.safeParse(input);
  if (!parsed.success) {
    return {
      level: 1,
      passed: false,
      checks: [
        {
          name: "schema",
          passed: false,
          detail: `schéma invalide : ${parsed.error.issues.length} erreur(s)`,
        },
      ],
    };
  }
  const air: ProjectAir = parsed.data;
  const diagnostics = [
    ...validateAir(air).map((d) => `semantics:${d.code}`),
    ...validateAirCapabilities(air).map((d) => `capabilities:${d.code}`),
    ...validateAirBlocks(air).map((d) => `blocks:${d.code}`),
  ];
  checks.push({
    name: "validateurs",
    passed: diagnostics.length === 0,
    detail: diagnostics.length === 0 ? "0 diagnostic aux 4 validateurs" : diagnostics.join(", "),
  });

  // --- 1. Déterminisme : recompilation ×2 stable, et = hash attendu.
  //     compileProject est fail-closed (lève sur AIR invalide) → enveloppé
  //     pour produire un CONTRÔLE ÉCHOUÉ, jamais une exception.
  try {
    const a = compileProject(air).rootHash;
    const b = compileProject(air).rootHash;
    const stable = a === b;
    const expected = expectedRootHash;
    const matchesExpected = expected === undefined || a === expected;
    checks.push({
      name: "determinisme",
      passed: stable && matchesExpected,
      detail: stable
        ? matchesExpected
          ? `rootHash stable ${a.slice(0, 16)}`
          : `rootHash ${a.slice(0, 16)} ≠ attendu ${expected.slice(0, 16)}`
        : "recompilation non déterministe",
    });
  } catch (e) {
    checks.push({ name: "determinisme", passed: false, detail: String(e).slice(0, 120) });
  }

  // --- 3. Diff permissions/manifestes vs AIR (§9).
  try {
    const appJson = JSON.parse(emitAppJson(air, RELEASE_TRAIN_V1)) as {
      expo: {
        android: { permissions: string[] };
        ios: { infoPlist?: Record<string, string> };
      };
    };
    const induced = inducedPermissionsFor(air.capabilities.map((c) => c.capability));
    const expectedAndroid = induced
      .filter((p) => p.platform === "android")
      .map((p) => p.permission)
      .sort(byCodeUnit);
    const gotAndroid = [...appJson.expo.android.permissions].sort(byCodeUnit);
    const expectedIos = induced
      .filter((p) => p.platform === "ios")
      .map((p) => p.permission)
      .sort(byCodeUnit);
    const gotIos = Object.keys(appJson.expo.ios.infoPlist ?? {}).sort(byCodeUnit);
    const androidOk = JSON.stringify(expectedAndroid) === JSON.stringify(gotAndroid);
    const iosOk = JSON.stringify(expectedIos) === JSON.stringify(gotIos);
    checks.push({
      name: "permissions_vs_air",
      passed: androidOk && iosOk,
      detail:
        androidOk && iosOk
          ? `manifeste conforme (${gotAndroid.length} Android, ${gotIos.length} iOS)`
          : `divergence : android=${androidOk} ios=${iosOk}`,
    });
  } catch (e) {
    checks.push({ name: "permissions_vs_air", passed: false, detail: String(e).slice(0, 120) });
  }

  // --- 4. Cohérence du schéma backend : tables ⇔ entités de l'AIR.
  try {
    const sql = generateProvisioningSql(air);
    const tables = [...sql.summary.tables].sort(byCodeUnit);
    const entityIds = air.entities.map((e) => e.id).sort(byCodeUnit);
    const ok =
      JSON.stringify(tables) === JSON.stringify(entityIds) &&
      sql.lock.airHash === sha256Hex(canonicalJson(air));
    checks.push({
      name: "backend_vs_air",
      passed: ok,
      detail: ok
        ? `${tables.length} tables ⇔ ${entityIds.length} entités`
        : "tables ≠ entités de l'AIR",
    });
  } catch (e) {
    checks.push({ name: "backend_vs_air", passed: false, detail: String(e).slice(0, 120) });
  }

  return { level: 1, passed: checks.every((c) => c.passed), checks };
}
