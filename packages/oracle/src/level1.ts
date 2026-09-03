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
//  5. Politique AST des Code Slots (Phase 9, §9 niveau 1 « politique AST
//     (slots, copies de blocs, réseau) ») — REJOUÉE par le vérificateur sur
//     les modules RÉELLEMENT ÉMIS, jamais sur la déclaration du générateur.
//  6. Intégrité des copies (blocs, primitives, tokens, runtime) : §3 exige
//     qu'une copie de bloc ne soit JAMAIS éditée sur place, « ni par le
//     Repair Loop, ni par un Code Slot ». Le contrôle compare octet à octet
//     l'artefact émis aux copies embarquées du compilateur.
//  8. CONTRAT D'EXÉCUTION : l'Oracle RECALCULE, sans faire confiance au
//     générateur, l'écart entre ce que l'AIR déclare et ce que le moteur
//     sait exécuter. Ce contrôle ne REFUSE pas encore (mode
//     `declared_degraded`) : durcir en `strict` change un critère de
//     sortie et relève d'une décision consignée, jamais d'un durcissement
//     silencieux — la règle qui interdit d'ASSOUPLIR un critère après coup
//     interdit tout autant de le RESSERRER sans décision. Ce qu'il apporte
//     dès maintenant : l'écart cesse d'être invisible.
import {
  canonicalJson,
  projectAirSchema,
  sha256Hex,
  validateAir,
  type ProjectAir,
} from "@deribfy/air-schema";
import { inducedPermissionsFor, validateAirCapabilities } from "@deribfy/capability-registry";
import { validateAirBlocks } from "@deribfy/blocks/registry";
import {
  compileProject,
  emitAppJson,
  EMBEDDED_ASSETS,
  normalizeAir,
  RELEASE_TRAIN_V1,
  type SlotSource,
} from "@deribfy/compiler";
import { generateProvisioningSql } from "@deribfy/provisioner";
import { checkSlotBundle } from "@deribfy/slots";
import {
  EXECUTION_ENVELOPE_V1,
  analyzeFeasibility,
} from "@deribfy/execution-contract";
import { emitThemeModule, hasThemeOverrides } from "@deribfy/compiler";
import { wcagFailures } from "./apxx-grid.ts";

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

export interface OracleOptions {
  /** Code Slots livrés avec le projet — l'Oracle recompile À L'IDENTIQUE. */
  readonly slots?: readonly SlotSource[];
}

/**
 * Exécute l'Oracle niveau 1 sur un document AIR. `expectedRootHash`, s'il
 * est fourni, est l'artefact enregistré à la compilation : l'Oracle vérifie
 * qu'une recompilation indépendante retombe sur ce hash (déterminisme
 * prouvé côté vérificateur, pas déclaré côté générateur). `options.slots`
 * fournit les Code Slots du projet : l'Oracle recompile À L'IDENTIQUE, sinon
 * il vérifierait un artefact différent de celui qui a été livré.
 */
export function runOracleLevel1(
  input: unknown,
  expectedRootHash?: string,
  options: OracleOptions = {},
): OracleVerdict {
  const checks: OracleCheck[] = [];

  // --- 2. Re-validation fail-closed (avant tout : un AIR non conforme ne
  //        passe aucun autre contrôle).
  // NORMALISATION (D-044) : l'Oracle est un service SÉPARÉ avec son propre
  // point d'entrée — il doit migrer comme le compilateur, sinon un document
  // d'une version antérieure serait refusé au schéma au lieu d'être vérifié.
  const parsed = projectAirSchema.safeParse(normalizeAir(input));
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
    const a = compileProject(air, RELEASE_TRAIN_V1, options).rootHash;
    const b = compileProject(air, RELEASE_TRAIN_V1, options).rootHash;
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

  // --- 5. Politique AST des Code Slots + 6. intégrité des copies (§3, §9).
  //     Les deux contrôles LISENT LES FICHIERS ÉMIS : l'Oracle ne fait pas
  //     confiance au bundle qu'on lui présente, il analyse ce qui part
  //     réellement dans le projet.
  try {
    const compiled = compileProject(air, RELEASE_TRAIN_V1, options);
    const emitted = [...compiled.files.entries()]
      .filter(([p]) => p.startsWith("slots/") && p !== "slots/index.ts")
      .map(([p, source]) => ({
        slotId: p.slice("slots/".length).replace(/\.ts$/, ""),
        source,
        authorId: "artefact",
      }));
    const verdict = checkSlotBundle(emitted, air.slots);
    // Cohérence du registre : il référence EXACTEMENT les modules émis.
    const registry = compiled.files.get("slots/index.ts") ?? "";
    const registered = [...registry.matchAll(/from "\.\/([a-z0-9_]+)";/g)].map((m) => m[1] ?? "");
    const emittedIds = emitted.map((e) => e.slotId).sort(byCodeUnit);
    const registryOk =
      emitted.length === 0
        ? registry === ""
        : JSON.stringify([...registered].sort(byCodeUnit)) === JSON.stringify(emittedIds);
    checks.push({
      name: "slots_politique_ast",
      passed: verdict.passed && registryOk,
      detail: !verdict.passed
        ? verdict.violations
            .slice(0, 4)
            .map((v) => `${v.slotId}:${v.code}@${String(v.line)}`)
            .join(", ")
        : registryOk
          ? `${String(emitted.length)} slot(s) émis, politique AST satisfaite`
          : "registre de slots incohérent avec les modules émis",
    });

    // Le thème PEUT légitimement différer de la copie embarquée depuis la
    // v2 (identité visuelle par app) : l'Oracle ne l'exempte pas pour
    // autant, il RECALCULE ce que le thème doit être et compare.
    const themePath = "lib/tokens/theme.generated.ts";
    const attenduTheme = hasThemeOverrides(air) ? emitThemeModule(air) : EMBEDDED_ASSETS[themePath];
    const drifted = Object.keys(EMBEDDED_ASSETS)
      .filter((path) =>
        path === themePath
          ? compiled.files.get(path) !== attenduTheme
          : compiled.files.get(path) !== EMBEDDED_ASSETS[path],
      )
      .sort(byCodeUnit);
    checks.push({
      name: "copies_integrite",
      passed: drifted.length === 0,
      detail:
        drifted.length === 0
          ? `${String(Object.keys(EMBEDDED_ASSETS).length)} copies conformes octet à octet`
          : `copies modifiées : ${drifted.join(", ")}`,
    });
    // --- 7. CONFORMITÉ D'ACCESSIBILITÉ (§22 : « accessibilité = conformité
    //     (gate + Oracle) »). Contrôle sur le thème RÉELLEMENT ÉMIS : depuis
    //     la v2, chaque app peut porter sa propre identité visuelle, donc le
    //     seuil WCAG 2.2 AA doit être vérifié app par app sur l'artefact.
    const { pairs, failures } = wcagFailures(compiled.files.get("lib/tokens/theme.generated.ts") ?? "");
    checks.push({
      name: "contraste_wcag",
      passed: failures.length === 0,
      detail:
        failures.length === 0
          ? `${String(pairs)} paires texte/fond ≥ 4,5:1`
          : `${String(failures.length)} paire(s) sous le seuil : ${failures.slice(0, 4).join(", ")}`,
    });
  } catch (e) {
    checks.push({ name: "slots_politique_ast", passed: false, detail: String(e).slice(0, 120) });
  }

  // --- 8. CONTRAT D'EXÉCUTION (Étape 1) — l'écart déclaré/exécuté.
  //     Jusqu'ici, un artefact dont 86 % des actions étaient inertes passait
  //     l'Oracle 7/7 : aucun contrôle ne regardait le COMPORTEMENT. Ce
  //     contrôle recalcule la réconciliation depuis l'AIR, comme les autres
  //     recalculent depuis les artefacts — jamais sur déclaration.
  try {
    const feasibility = analyzeFeasibility(air, EXECUTION_ENVELOPE_V1, "declared_degraded");
    const { metrics } = feasibility;
    const byOwner = { contrat: 0, document: 0, moteur: 0 };
    for (const gap of feasibility.gaps) byOwner[gap.owner] += 1;
    checks.push({
      name: "contrat_execution",
      // `refused` est impossible en mode déclaré : le contrôle échoue donc
      // uniquement si la réconciliation elle-même est incohérente.
      passed: feasibility.verdict !== "refused",
      detail:
        feasibility.gaps.length === 0
          ? `aucun écart — enveloppe ${feasibility.envelopeVersion}`
          : `${String(feasibility.gaps.length)} écart(s) DÉCLARÉ(S) ` +
            `[moteur ${String(byOwner.moteur)} · contrat ${String(byOwner.contrat)} · document ${String(byOwner.document)}] · ` +
            `effets ${String(metrics.effectsExecuted)}/${String(metrics.effectsDeclared)} · ` +
            `écrans atteignables ${String(metrics.screensReachableEffective)}/${String(metrics.screensDeclared)} · ` +
            `contrôles fantômes ${String(metrics.ghostControls)}/${String(metrics.controlsVisible)} · ` +
            `sceau ${feasibility.reportHash.slice(0, 16)}`,
    });
  } catch (e) {
    checks.push({ name: "contrat_execution", passed: false, detail: String(e).slice(0, 120) });
  }

  return { level: 1, passed: checks.every((c) => c.passed), checks };
}
