// Worker d'UNE compilation (v46) : charge le compilateur (sources TS),
// compile le document, range au store, imprime {rootHash, storeOk}.
// Exécuté SOUS le harnais V5 (--import) : tout accès réseau = mort.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const [docPath, storeDir] = process.argv.slice(2);
const { compileProject } = await import(join(REPO, "packages/compiler/src/compile-project.ts"));
const { LocalArtifactStore, storeCompiledProject } = await import(
  join(REPO, "packages/compiler/src/artifact-store.ts")
);

const air = JSON.parse(readFileSync(docPath, "utf8"));
const compiled = compileProject(air);
const store = new LocalArtifactStore(storeDir);
const stored = storeCompiledProject(store, compiled);
const storeOk =
  stored.manifestHash === compiled.rootHash &&
  store.get(stored.rootHash).toString("utf8") === compiled.manifest;
process.stdout.write(JSON.stringify({ rootHash: compiled.rootHash, storeOk }) + "\n");
