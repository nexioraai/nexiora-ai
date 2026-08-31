// COMPILATION COMPLÈTE (4.6, D-031) — AIR → projet Expo COMPLET (gabarit
// scellé + émission 4.3-4.5) + manifeste Merkle + hash racine. Fonction
// PURE : zéro fs/réseau/horloge (gabarit et copies embarqués en modules
// générés, non-dérive testée). Le hash racine est LE hash du critère dur
// de la Phase 4 (10 compilations → hash identique 10/10 sur le corpus
// ACTIF v2). Manifeste (S3, patron V2 prouvé) : entrées {path, sha256}
// triées par point de code, JSON canonique, racine = SHA-256 du manifeste.
import { canonicalJson, sha256Hex, type ProjectLock } from "@deribfy/air-schema";
import { EMBEDDED_TEMPLATE } from "./embedded-template.generated.ts";
import { EmitError, emitProject, type EmitOptions } from "./emit-project.ts";
import { RELEASE_TRAIN_V1, type ReleaseTrain } from "./release-train.ts";

export interface CompiledProject {
  lock: ProjectLock;
  /** Projet COMPLET : gabarit + fichiers émis. */
  files: ReadonlyMap<string, string>;
  /** Manifeste Merkle canonique (chaîne JSON, LF final). */
  manifest: string;
  /** SHA-256 du manifeste — le hash de sortie du critère dur. */
  rootHash: string;
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function compileProject(
  input: unknown,
  train: ReleaseTrain = RELEASE_TRAIN_V1,
  options: EmitOptions = {},
): CompiledProject {
  const { lock, files: emitted } = emitProject(input, train, options);
  const files = new Map<string, string>();
  for (const [path, content] of Object.entries(EMBEDDED_TEMPLATE)) {
    files.set(path, content);
  }
  for (const [path, content] of emitted) {
    if (files.has(path)) {
      // Le gabarit est scellé et l'émission contrôlée : une collision est
      // un défaut du compilateur, jamais un cas d'entrée — refus net.
      throw new EmitError("COMPILE_PATH_CONFLICT", path, "gabarit ⇋ émission");
    }
    files.set(path, content);
  }

  const entries = [...files.keys()].sort(byCodeUnit).map((path) => ({
    path,
    sha256: sha256Hex(files.get(path) ?? ""),
  }));
  const manifest =
    canonicalJson({
      airHash: lock.airHash,
      entries,
      merkleVersion: "1",
      releaseTrain: lock.resolved.releaseTrain,
    }) + "\n";
  return { lock, files, manifest, rootHash: sha256Hex(manifest) };
}
