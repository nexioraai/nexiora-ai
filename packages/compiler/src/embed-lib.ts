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
    source: "compiler/runtime/capability-provider.tsx",
    target: "lib/runtime/capability-provider.tsx",
    rewrites: {},
  },
  {
    source: "compiler/runtime/demo-provider.ts",
    target: "lib/runtime/demo-provider.ts",
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
