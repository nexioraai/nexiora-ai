// P-002 — TEST MINIMAL MODAL (préflight, symétrique d'e2b-smoke) :
// créer un sandbox → commande DÉTERMINISTE → sortie exacte deribfy-42 →
// terminate en finally → PREUVE D'ABSENCE par listing. Fail-closed ;
// secrets (token ~/.deribfy-sandbox-bench.env, mode 600) jamais
// journalisés. Coût : ~secondes de compute (crédits gratuits).
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(HERE, "results"), { recursive: true });
const LOG = join(HERE, "results", `modal-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
const log = (o) => { appendFileSync(LOG, JSON.stringify(o) + "\n"); console.log(JSON.stringify(o)); };

const FILE = join(homedir(), ".deribfy-sandbox-bench.env");
if ((statSync(FILE).mode & 0o777) !== 0o600) throw new Error("permissions env ≠ 600");
const env = readFileSync(FILE, "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const tokenId = get("MODAL_TOKEN_ID");
const tokenSecret = get("MODAL_TOKEN_SECRET");
if (!tokenId || !tokenSecret) throw new Error("tokens Modal absents");

const { ModalClient } = await import("modal");
const client = new ModalClient({ tokenId, tokenSecret });
let sbx;
let ok = false;
try {
  const app = await client.apps.fromName("deribfy-p002-preflight", { createIfMissing: true });
  const image = await client.images.fromRegistry("alpine:3.21");
  const t0 = Date.now();
  sbx = await client.sandboxes.create(app, image, { timeoutMs: 120_000 });
  log({ etape: "create", sandboxId: sbx.sandboxId, coldStartMs: Date.now() - t0 });

  const proc = await sbx.exec(["sh", "-c", "echo deribfy-$((6*7))"], { mode: "text" });
  const [stdout, exitCode] = await Promise.all([proc.stdout.readText(), proc.wait()]);
  const attendu = "deribfy-42";
  const obtenu = (stdout ?? "").trim();
  log({ etape: "exec", exitCode, attendu, obtenu });
  ok = exitCode === 0 && obtenu === attendu;
} catch (e) {
  log({ ERREUR: String(e?.message ?? e).slice(0, 300) });
  ok = false;
} finally {
  try {
    if (sbx !== undefined) {
      await sbx.terminate({ wait: true });
      log({ etape: "terminate", sandboxId: sbx.sandboxId });
    }
    const listed = [];
    for await (const s of client.sandboxes.list()) listed.push(s.sandboxId);
    const residuel = sbx !== undefined && listed.includes(sbx.sandboxId);
    log({ etape: "preuve-absence", sandboxsActifs: listed.length, notreResiduel: residuel });
    if (residuel) ok = false;
  } catch (e) {
    log({ ALERTE: `vérification d'absence en échec: ${String(e?.message ?? e).slice(0, 200)}` });
    ok = false;
  }
  try { client.close(); } catch { /* fermeture best-effort */ }
  log({ VERDICT: ok ? "SMOKE MODAL : VERT" : "ÉCHEC", journal: LOG });
  process.exitCode = ok ? 0 : 1;
}
