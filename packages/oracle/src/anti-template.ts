// DIMENSION H — VARIÉTÉ ANTI-TEMPLATE (Phase 10, D-039 · ARCHITECTURE §22).
//
// §22 : « une app générée ne doit pas ressembler à un gabarit IA générique ».
// La grille A++ le formule ainsi : « deux apps de domaines distincts ne
// partagent pas la même silhouette », preuve par scorecard cross-domain.
//
// MÉTHODE — deux axes, mesurés séparément parce qu'ils peuvent diverger, et
// c'est précisément ce que la mesure a révélé :
//  · axe STRUCTUREL : la silhouette d'une app = la suite ORDONNÉE des types
//    de blocs de chacun de ses écrans, triée pour être indépendante de
//    l'ordre de déclaration. Deux domaines distincts ne doivent pas produire
//    la même silhouette.
//  · axe VISUEL : l'identité visuelle EFFECTIVEMENT ÉMISE (thème, feuilles
//    de style, primitives, blocs). Si les documents déclarent des thèmes
//    DIFFÉRENTS et que les artefacts émis sont identiques, la variété
//    déclarée est inerte — l'app est un gabarit, quelle que soit la
//    diversité de sa structure.
//
// Aucun SEUIL de similarité arbitraire n'est introduit : les deux critères
// sont des égalités exactes, donc non négociables et non réglables.
import { sha256Hex } from "@deribfy/air-schema";
import type { ProjectAir } from "@deribfy/air-schema";
import type { DimensionState } from "./apxx-grid.ts";

export interface DomainSample {
  readonly domain: string;
  readonly air: ProjectAir;
  readonly files: ReadonlyMap<string, string>;
}

export interface AntiTemplateReport {
  readonly domains: number;
  readonly state: DimensionState;
  readonly structuralSignatures: readonly { readonly domain: string; readonly signature: string }[];
  /** Paires de domaines partageant EXACTEMENT la même silhouette. */
  readonly structuralCollisions: readonly string[];
  /** Nombre d'identités visuelles distinctes parmi les apps comparées. */
  readonly visualVariants: number;
  /** Thèmes déclarés dans l'AIR, dédupliqués. */
  readonly declaredThemes: readonly string[];
  readonly detail: string;
}

/** Fichiers qui PORTENT l'identité visuelle du projet émis. */
export const VISUAL_FILES: readonly string[] = [
  "lib/tokens/theme.generated.ts",
  "lib/primitives/styles.ts",
  "lib/primitives/primitives.tsx",
  "lib/blocks/components.tsx",
];

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Silhouette structurelle : suite des types de blocs, écran par écran. */
export function structuralSignature(air: ProjectAir): string {
  const screens = air.screens
    .map((screen) => screen.blocks.map((b) => b.blockType).join(">"))
    .sort(byCodeUnit);
  return sha256Hex(`${String(air.screens.length)}#${screens.join("|")}`);
}

/** Identité visuelle : empreinte des fichiers qui déterminent l'apparence. */
export function visualSignature(files: ReadonlyMap<string, string>): string {
  return sha256Hex(VISUAL_FILES.map((path) => `${path}:${sha256Hex(files.get(path) ?? "")}`).join("|"));
}

/**
 * Évalue la dimension H sur un ensemble de domaines. Moins de 2 domaines ⇒
 * NON DÉTERMINÉE (jamais conforme par défaut, règle D-039).
 */
export function evaluateAntiTemplate(samples: readonly DomainSample[]): AntiTemplateReport {
  const ordered = [...samples].sort((a, b) => byCodeUnit(a.domain, b.domain));
  const structuralSignatures = ordered.map((s) => ({
    domain: s.domain,
    signature: structuralSignature(s.air),
  }));
  const declaredThemes = [...new Set(ordered.map((s) => s.air.design.theme))].sort(byCodeUnit);
  const visualVariants = new Set(ordered.map((s) => visualSignature(s.files))).size;

  const collisions: string[] = [];
  for (let i = 0; i < structuralSignatures.length; i += 1) {
    for (let j = i + 1; j < structuralSignatures.length; j += 1) {
      const a = structuralSignatures[i];
      const b = structuralSignatures[j];
      if (a !== undefined && a.signature === b?.signature) {
        collisions.push(`${a.domain}≡${b.domain}`);
      }
    }
  }

  if (ordered.length < 2) {
    return {
      domains: ordered.length,
      state: "non_determinee",
      structuralSignatures,
      structuralCollisions: collisions,
      visualVariants,
      declaredThemes,
      detail: "moins de 2 domaines comparés — jamais conforme par défaut",
    };
  }

  const structuralOk = collisions.length === 0;
  // La variété visuelle n'est exigée QUE si les documents en déclarent une :
  // des thèmes identiques rendraient des apparences identiques légitimes.
  const visualExpected = declaredThemes.length > 1;
  const visualOk = !visualExpected || visualVariants > 1;

  return {
    domains: ordered.length,
    state: structuralOk && visualOk ? "conforme" : "non_conforme",
    structuralSignatures,
    structuralCollisions: collisions,
    visualVariants,
    declaredThemes,
    detail:
      `${String(ordered.length)} domaines · structure : ${String(structuralSignatures.length - collisions.length)} silhouettes distinctes, ` +
      `${String(collisions.length)} collision(s)${collisions.length > 0 ? ` (${collisions.join(", ")})` : ""} · ` +
      `visuel : ${String(visualVariants)} identité(s) pour ${String(declaredThemes.length)} thème(s) déclaré(s)` +
      (visualExpected && !visualOk ? " — variété déclarée INERTE dans l'artefact émis" : ""),
  };
}
