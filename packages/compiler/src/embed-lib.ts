// EMBARQUEMENT DES COPIES (4.3, D-026 Option C / D-007) — bibliothèque
// PURE : décrit le jeu EXACT de fichiers copiés dans chaque projet généré
// (blocs, primitives, tokens, runtime du compilateur) et les réécritures
// d'imports (spécificateurs de paquets → chemins relatifs de la copie).
// Consommée par scripts/embed-assets.mjs (génération du module embarqué)
// ET par le test de non-dérive (recalcul depuis les vraies sources) — le
// chemin de compilation, lui, n'ouvre jamais un fichier : il lit le module
// généré `embedded-assets.generated.ts`.
export interface EmbeddedSourceSpec {
  /** Chemin de la source dans le dépôt, relatif à `packages/`. */
  source: string;
  /** Chemin de la copie dans le projet généré. */
  target: string;
  /** Réécritures d'imports : spécificateur exact → remplacement exact. */
  rewrites: Readonly<Record<string, string>>;
}

export const EMBEDDED_SOURCES: readonly EmbeddedSourceSpec[] = [
  {
    source: "design-tokens/src/theme.generated.ts",
    target: "lib/tokens/theme.generated.ts",
    rewrites: {},
  },
  {
    source: "compiler/runtime/tokens-index.ts",
    target: "lib/tokens/index.ts",
    rewrites: {},
  },
  {
    source: "primitives/src/index.ts",
    target: "lib/primitives/index.ts",
    rewrites: {},
  },
  {
    source: "primitives/src/contracts.ts",
    target: "lib/primitives/contracts.ts",
    rewrites: {},
  },
  {
    source: "primitives/src/styles.ts",
    target: "lib/primitives/styles.ts",
    rewrites: { "@deribfy/design-tokens": "../tokens" },
  },
  {
    source: "primitives/src/theme-bridge.tsx",
    target: "lib/primitives/theme-bridge.tsx",
    rewrites: {},
  },
  {
    source: "primitives/src/primitives.tsx",
    target: "lib/primitives/primitives.tsx",
    rewrites: {},
  },
  {
    source: "blocks/src/contracts.ts",
    target: "lib/blocks/contracts.ts",
    rewrites: {},
  },
  {
    source: "blocks/src/components.tsx",
    target: "lib/blocks/components.tsx",
    rewrites: { "@deribfy/primitives": "../primitives" },
  },
  {
    source: "compiler/runtime/data-provider.tsx",
    target: "lib/runtime/data-provider.tsx",
    rewrites: {},
  },
  {
    source: "compiler/runtime/slot-provider.tsx",
    target: "lib/runtime/slot-provider.tsx",
    rewrites: {},
  },
  {
    // Phase 4 — la session : contrat, implémentation locale, et le
    // fournisseur de capabilities qui honore `auth`.
    source: "compiler/runtime/session-contract.ts",
    target: "lib/runtime/session-contract.ts",
    rewrites: {},
  },
  {
    source: "compiler/runtime/session-provider.tsx",
    target: "lib/runtime/session-provider.tsx",
    rewrites: {},
  },
  {
    source: "compiler/runtime/session-locale.ts",
    target: "lib/runtime/session-locale.ts",
    rewrites: {},
  },
  {
    source: "compiler/runtime/session-supabase.ts",
    target: "lib/runtime/session-supabase.ts",
    rewrites: {},
  },
  {
    source: "compiler/runtime/capabilites-auth.ts",
    target: "lib/runtime/capabilites-auth.ts",
    rewrites: {},
  },
  {
    source: "compiler/runtime/capability-provider.tsx",
    target: "lib/runtime/capability-provider.tsx",
    rewrites: {},
  },
  {
    source: "compiler/runtime/form-state.tsx",
    target: "lib/runtime/form-state.tsx",
    rewrites: {},
  },
  {
    source: "compiler/runtime/primary-nav.tsx",
    target: "lib/runtime/primary-nav.tsx",
    // `useStyles` vit dans le pont de thème, pas dans l'index des primitives :
    // la copie doit viser le MÊME module que celui embarqué, sinon l'app émise
    // ne compile pas — défaut attrapé par le `tsc` du projet témoin.
    rewrites: { "@deribfy/primitives/theme-bridge": "../primitives/theme-bridge" },
  },
  {
    source: "compiler/runtime/demo-provider.ts",
    target: "lib/runtime/demo-provider.ts",
    rewrites: {},
  },
  {
    // E3.1 (D-130) — magasin observable PUR : instantané par entité, états
    // réels, observation. Aucun réseau, aucune horloge, aucun « live ».
    source: "compiler/runtime/magasin-donnees.ts",
    target: "lib/runtime/magasin-donnees.ts",
    rewrites: {},
  },
  {
    // E3.3 (D-132) : adaptateur de source distante — générique, fail-closed.
    source: "compiler/runtime/source-reseau.ts",
    target: "lib/runtime/source-reseau.ts",
    rewrites: {},
  },
  {
    // E1/E2 (D-129) — pipeline PUR des lignes de liste, prouvé par tests
    // unitaires sans monter react-native.
    source: "compiler/runtime/list-pipeline.ts",
    target: "lib/runtime/list-pipeline.ts",
    rewrites: {},
  },
  {
    source: "compiler/runtime/air-runtime.tsx",
    target: "lib/runtime/air-runtime.tsx",
    rewrites: {},
  },
];

export class EmbedRewriteError extends Error {
  constructor(spec: EmbeddedSourceSpec, specifier: string, count: number) {
    super(
      `EMBED_REWRITE:${spec.source}:${specifier}: ${count} occurrence(s) — 1 exigée`,
    );
    this.name = "EmbedRewriteError";
  }
}

/**
 * Applique les réécritures d'imports d'un fichier copié. Chaque
 * spécificateur DOIT apparaître exactement une fois sous la forme
 * `from "<spécificateur>"` — toute dérive des sources gelées casse ici
 * (fail-closed), en plus des scellés du train.
 */
export function rewriteEmbeddedSource(
  spec: EmbeddedSourceSpec,
  content: string,
): string {
  let out = content;
  for (const [specifier, replacement] of Object.entries(spec.rewrites)) {
    const needle = `from "${specifier}"`;
    const count = out.split(needle).length - 1;
    if (count !== 1) throw new EmbedRewriteError(spec, specifier, count);
    out = out.replace(needle, `from "${replacement}"`);
  }
  return out;
}

/** Construit la table complète des copies depuis un lecteur de sources. */
export function buildEmbeddedAssets(
  readSource: (repoRelativePath: string) => string,
): Record<string, string> {
  const assets: Record<string, string> = {};
  for (const spec of EMBEDDED_SOURCES) {
    assets[spec.target] = rewriteEmbeddedSource(spec, readSource(spec.source));
  }
  return assets;
}
