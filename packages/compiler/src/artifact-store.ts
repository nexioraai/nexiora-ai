// ARTIFACT STORE v1 (4.6, D-031 — ARCHITECTURE §24) : artefacts IMMUABLES
// adressés SHA-256. v1 = interface + implémentation LOCALE content-addressed
// (répertoire `ab/abcdef…`) — l'object storage distant est un provider
// branchable (§15/§24), aucun compte externe en Phase 4. Ce module est le
// SEUL du paquet à toucher le fs : le chemin de compilation (resolve/emit/
// compile) reste pur ; écrire au store est un acte du PIPELINE, après
// compilation. Immuabilité : un hash déjà présent n'est jamais réécrit ;
// un contenu divergent pour un même hash = corruption, refus net.
import { createHash } from "node:crypto";
import { canonicalJson } from "@deribfy/air-schema";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { CompiledProject } from "./compile-project.ts";

export interface ArtifactStore {
  put(bytes: Uint8Array | string): string;
  get(hash: string): Buffer;
  has(hash: string): boolean;
}

export class ArtifactStoreError extends Error {
  readonly code: string;

  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ArtifactStoreError";
    this.code = code;
  }
}

const HASH_RE = /^[0-9a-f]{64}$/;

export class LocalArtifactStore implements ArtifactStore {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  private pathFor(hash: string): string {
    if (!HASH_RE.test(hash)) {
      throw new ArtifactStoreError("STORE_HASH_INVALID", hash);
    }
    return join(this.root, hash.slice(0, 2), hash);
  }

  put(bytes: Uint8Array | string): string {
    const buffer = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : Buffer.from(bytes);
    const hash = createHash("sha256").update(buffer).digest("hex");
    const path = this.pathFor(hash);
    if (existsSync(path)) {
      if (!readFileSync(path).equals(buffer)) {
        throw new ArtifactStoreError("STORE_CORRUPTION", hash);
      }
      return hash;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buffer);
    return hash;
  }

  get(hash: string): Buffer {
    const path = this.pathFor(hash);
    if (!existsSync(path)) throw new ArtifactStoreError("STORE_MISS", hash);
    const buffer = readFileSync(path);
    const actual = createHash("sha256").update(buffer).digest("hex");
    if (actual !== hash) throw new ArtifactStoreError("STORE_CORRUPTION", hash);
    return buffer;
  }

  has(hash: string): boolean {
    return existsSync(this.pathFor(hash));
  }
}

export interface StoredProject {
  rootHash: string;
  manifestHash: string;
  lockHash: string;
  fileCount: number;
}

// Range un projet compilé : chaque fichier + le manifeste + le lock
// canonique. Le manifeste relie les hashes ; `rootHash` = hash du
// manifeste (déduplication naturelle : deux compilations identiques ne
// stockent rien de nouveau).
export function storeCompiledProject(
  store: ArtifactStore,
  compiled: CompiledProject,
): StoredProject {
  for (const content of compiled.files.values()) {
    store.put(content);
  }
  const manifestHash = store.put(compiled.manifest);
  // Par construction rootHash = SHA-256 du manifeste : le store DOIT
  // retrouver exactement cette adresse (contrôle d'intégrité croisé).
  if (manifestHash !== compiled.rootHash) {
    throw new ArtifactStoreError("STORE_ROOT_MISMATCH", manifestHash);
  }
  const lockHash = store.put(canonicalJson(compiled.lock));
  return {
    rootHash: compiled.rootHash,
    manifestHash,
    lockHash,
    fileCount: compiled.files.size,
  };
}
