// V5 (4.0, D-026) — CONTRÔLES du harnais zéro-réseau.
// CONTRÔLE POSITIF (mode "positif") : tentatives réseau par les PATRONS
// D'USAGE RÉELS (import par défaut, callbacks fournis) sur 5 canaux.
// « Tué » = NetworkForbiddenError SYNCHRONE (marqueur du harnais)
// EXCLUSIVEMENT — une erreur d'usage (TypeError) ne compte PAS : c'est la
// leçon du faux verdict du 1er passage (dns.lookup sans callback lève un
// TypeError même sans harnais). Sans harnais, chacun de ces appels part en
// E/S asynchrone sans lever — le contrôle détecte donc bien son absence.
// CONTRÔLE NÉGATIF (mode "negatif") : charge représentative du chemin de
// compilation (parse + 4 validateurs + sérialisation canonique + hash,
// 12 documents du corpus ACTIF v2) — DOIT passer sans déclencher le
// harnais. Import du module PUR du registre de blocs par chemin direct
// (précédent consigné D-025 : l'index du paquet tire components.tsx, que
// node ne strippe pas).
// Usage : node --import ./v5-zero-reseau-preload.mjs v5-controls.mjs <mode>
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const mode = process.argv[2];

if (mode === "positif") {
  const results = [];
  const attempt = async (channel, fn) => {
    try {
      await fn();
      results.push({ channel, killed: false, error: null });
    } catch (e) {
      results.push({
        channel,
        killed: e.name === "NetworkForbiddenError",
        error: `${e.name}: ${String(e.message).slice(0, 60)}`,
      });
    }
  };
  await attempt("fetch", () => fetch("https://example.com"));
  await attempt("https.get", async () => {
    const https = (await import("node:https")).default;
    https.get("https://example.com", () => {});
  });
  await attempt("net.connect", async () => {
    const net = (await import("node:net")).default;
    net.connect(443, "example.com");
  });
  await attempt("dns.lookup", async () => {
    const dns = (await import("node:dns")).default;
    dns.lookup("example.com", () => {});
  });
  await attempt("dgram.send", async () => {
    const dgram = (await import("node:dgram")).default;
    dgram.createSocket("udp4");
  });
  const killed = results.filter((r) => r.killed).length;
  console.log(JSON.stringify({ mode, results, verdict: `${killed}/5 tués` }));
  process.exitCode = killed === 5 ? 0 : 1;
} else if (mode === "negatif") {
  const air = await import(join(REPO, "packages/air-schema/src/index.ts"));
  const { canonicalJson, sha256Hex } = await import(
    join(REPO, "packages/air-schema/src/canonical.ts"),
  );
  const registry = await import(
    join(REPO, "packages/capability-registry/src/index.ts"),
  );
  const blocks = await import(join(REPO, "packages/blocks/src/registry.ts"));

  const dir = join(REPO, "packages/golden-corpus/corpus-v2");
  const docs = readdirSync(dir).filter((f) => f.endsWith(".air.json")).sort();
  let totalDiagnostics = 0;
  const hashes = [];
  for (const f of docs) {
    const doc = air.projectAirSchema.parse(
      JSON.parse(readFileSync(join(dir, f), "utf8")),
    );
    totalDiagnostics +=
      air.validateAir(doc).length +
      registry.validateAirCapabilities(doc).length +
      blocks.validateAirBlocks(doc).length;
    hashes.push(sha256Hex(canonicalJson(doc)));
  }
  console.log(
    JSON.stringify({
      mode,
      docs: docs.length,
      totalDiagnostics,
      hashSample: hashes[0].slice(0, 16),
      verdict:
        docs.length === 12 && totalDiagnostics === 0
          ? "CHARGE UTILE INTACTE 12/12, 0 diagnostic"
          : "ÉCHEC",
    }),
  );
  process.exitCode = docs.length === 12 && totalDiagnostics === 0 ? 0 : 1;
} else {
  throw new Error("mode requis : positif | negatif");
}
