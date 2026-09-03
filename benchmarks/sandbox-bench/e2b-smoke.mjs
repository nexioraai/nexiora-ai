// P-002 — TEST MINIMAL E2B (préflight, PAS le banc comparatif) :
// créer un sandbox → exécuter une commande DÉTERMINISTE → vérifier le
// résultat exact → détruire → PROUVER l'absence (listing). Fail-closed :
// tout écart = exit 1 ; kill en finally ; aucun sandbox résiduel ; la clé
// n'est jamais journalisée. Coût attendu : ~secondes de compute, couvert
// par le crédit d'essai (~0,00x $).
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(HERE, "results"), { recursive: true });
const LOG = join(HERE, "results", `e2b-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
const log = (o) => { appendFileSync(LOG, JSON.stringify(o) + "\n"); console.log(JSON.stringify(o)); };

const FILE = join(homedir(), ".deribfy-sandbox-bench.env");
if ((statSync(FILE).mode & 0o777) !== 0o600) throw new Error("permissions env ≠ 600");
const apiKey = readFileSync(FILE, "utf8").match(/^E2B_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) throw new Error("E2B_API_KEY absente");

const { Sandbox } = await import("e2b");
let sbx;
let ok = false;
const t0 = Date.now();
try {
  sbx = await Sandbox.create({ apiKey, timeoutMs: 120_000 });
  const tCreate = Date.now() - t0;
  log({ etape: "create", sandboxId: sbx.sandboxId, coldStartMs: tCreate });

  // Commande DÉTERMINISTE : sortie exacte attendue.
  const r = await sbx.commands.run("echo deribfy-$((6*7))");
  const attendu = "deribfy-42";
  const obtenu = (r.stdout ?? "").trim();
  log({ etape: "exec", exitCode: r.exitCode, attendu, obtenu });
  ok = r.exitCode === 0 && obtenu === attendu;
} catch (e) {
  log({ ERREUR: String(e?.message ?? e).slice(0, 300) });
  ok = false;
} finally {
  try {
    if (sbx !== undefined) {
      await sbx.kill();
      log({ etape: "kill", sandboxId: sbx.sandboxId });
    }
    // PREUVE D'ABSENCE : plus aucun sandbox en cours pour ce compte.
    const paginator = Sandbox.list({ apiKey });
    const running = await paginator.nextItems();
    const residuel = running.some((s) => s.sandboxId === sbx?.sandboxId);
    log({ etape: "preuve-absence", sandboxsActifs: running.length, notreResiduel: residuel });
    if (residuel) ok = false;
  } catch (e) {
    log({ ALERTE: `vérification d'absence en échec: ${String(e?.message ?? e).slice(0, 200)}` });
    ok = false;
  }
  log({ VERDICT: ok ? "SMOKE E2B : VERT" : "ÉCHEC", journal: LOG });
  process.exitCode = ok ? 0 : 1;
}
