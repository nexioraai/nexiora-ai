// POLITIQUE DE PÉRIMÈTRE DES PATCHS (Phase 9 — ARCHITECTURE §3 et §10).
//
// Règle fondatrice, verbatim §10 : « le repair modifie l'AIR ou les slots —
// jamais les blocs, jamais la structure, jamais les seuils de l'Oracle ».
// §3 la double côté artefacts : une copie de bloc est un ARTEFACT DE SORTIE
// du compilateur, « jamais éditée sur place — ni par le Repair Loop, ni par
// un Code Slot » ; toute correction d'un bloc passe par un bump de version
// et une recompilation, jamais par un diff.
//
// Ce module est la traduction MÉCANIQUE de ces deux phrases : il ne juge pas
// le contenu d'une édition, il juge son CHEMIN — et il est fail-closed,
// c'est-à-dire que tout chemin non explicitement autorisé est refusé.

export interface ProposedEdit {
  readonly path: string;
  readonly content: string;
}

export interface PatchViolation {
  readonly code: string;
  readonly path: string;
  readonly detail: string;
}

export interface PatchVerdict {
  readonly passed: boolean;
  readonly violations: readonly PatchViolation[];
}

/** SEUL préfixe éditable par une réparation dans le projet compilé. */
export const PATCH_ALLOWED_PREFIX = "slots/";

// Familles protégées, de la plus spécifique à la plus générale : le code de
// violation renvoyé nomme la RAISON exacte du refus (auditable).
const PROTECTED: readonly { readonly prefix: string; readonly code: string }[] = [
  { prefix: "lib/blocks/", code: "PATCH_BLOCK_COPY_EDIT" },
  { prefix: "lib/primitives/", code: "PATCH_DESIGN_SYSTEM_EDIT" },
  { prefix: "lib/tokens/", code: "PATCH_DESIGN_SYSTEM_EDIT" },
  { prefix: "lib/runtime/", code: "PATCH_RUNTIME_EDIT" },
  { prefix: "screens/", code: "PATCH_STRUCTURE_EDIT" },
  { prefix: "manifests/", code: "PATCH_STRUCTURE_EDIT" },
];

const PROTECTED_FILES: readonly string[] = [
  "App.tsx",
  "app.json",
  "demo.data.ts",
  "index.ts",
  "nav.data.ts",
  "navigation.tsx",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
];

/**
 * Vérifie qu'un ensemble d'éditions proposées reste dans le périmètre
 * autorisé. Fonction PURE ; verdict machinable.
 */
export function checkPatchScope(edits: readonly ProposedEdit[]): PatchVerdict {
  const violations: PatchViolation[] = [];
  for (const edit of edits) {
    const path = edit.path;
    // Normalisation défensive : un chemin remontant (« ../ ») ou absolu ne
    // désigne pas un artefact du projet — refus avant toute autre règle.
    if (path.startsWith("/") || path.split("/").includes("..")) {
      violations.push({ code: "PATCH_PATH_TRAVERSAL", path, detail: "chemin absolu ou remontant" });
      continue;
    }
    const protectedHit = PROTECTED.find((p) => path.startsWith(p.prefix));
    if (protectedHit !== undefined) {
      violations.push({
        code: protectedHit.code,
        path,
        detail: `artefact protégé (${protectedHit.prefix}) — correction par recompilation, jamais par diff`,
      });
      continue;
    }
    if (PROTECTED_FILES.includes(path)) {
      violations.push({ code: "PATCH_STRUCTURE_EDIT", path, detail: "fichier de structure du projet" });
      continue;
    }
    if (!path.startsWith(PATCH_ALLOWED_PREFIX)) {
      violations.push({ code: "PATCH_OUT_OF_SCOPE", path, detail: `hors "${PATCH_ALLOWED_PREFIX}"` });
    }
  }
  return { passed: violations.length === 0, violations };
}
