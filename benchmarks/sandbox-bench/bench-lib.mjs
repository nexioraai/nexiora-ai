// P-002 BANC COMPARATIF — bibliothèque PARTAGÉE (E1-E5). Fixture = app
// témoin RÉELLE compilée (resto-quartier, rootHash 343a94d9). Pipeline
// représentatif d'un projet GÉNÉRÉ = npm ci → tsc --noEmit → expo export
// (Oracle L1 §9 : typecheck strict + bundle ; le projet généré ne porte
// pas de suite vitest — consignation, PAS une épreuve retirée). Chaque
// épreuve écrit ses preuves en JSONL. Rien de secret n'est journalisé.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const TARBALL = join(HERE, "fixture-temoin.tgz");
export const fixtureBytes = () => readFileSync(TARBALL);

// Étapes du pipeline, jouées dans /app. `--ignore-scripts` (politique §8).
export const WORKDIR = "/tmp/build"; // inscriptible root ET non-root.
export const PIPELINE = [
  { name: "extract", cmd: `mkdir -p ${WORKDIR} && tar xzf /tmp/fixture.tgz -C ${WORKDIR}` },
  { name: "node_version", cmd: `cd ${WORKDIR} && node --version` },
  { name: "npm_ci", cmd: `cd ${WORKDIR} && npm ci --ignore-scripts --no-audit --no-fund` },
  { name: "tsc", cmd: `cd ${WORKDIR} && npx tsc --noEmit` },
  { name: "expo_export", cmd: `cd ${WORKDIR} && npx expo export --platform ios --platform android --output-dir dist` },
];

// E3 — egress par tentative : ces accès DOIVENT échouer sous allowlist
// (registre npm autorisé) ou sous coupure réseau totale.
export const EGRESS_PROBES = [
  { name: "domaine_tiers", cmd: "curl -sS -m 8 -o /dev/null -w '%{http_code}' https://example.com || echo BLOCKED" },
  { name: "ip_directe", cmd: "curl -sS -m 8 -o /dev/null -w '%{http_code}' https://1.1.1.1 || echo BLOCKED" },
  { name: "dns_exotique", cmd: "getent hosts telemetry.example.net || echo BLOCKED" },
];

// E4 — secrets par tentative : aucun secret ne doit être lisible.
export const SECRET_PROBES = [
  { name: "env_sensibles", cmd: "env | grep -iE 'KEY|TOKEN|SECRET|PASS' || echo NONE" },
  { name: "metadata_service", cmd: "curl -sS -m 5 -o /dev/null -w '%{http_code}' http://169.254.169.254/ || echo BLOCKED" },
];

export const parseCode = (s) => {
  const m = String(s).trim().match(/(\d{3}|BLOCKED|NONE)\s*$/);
  return m ? m[1] : String(s).trim().slice(-20);
};
