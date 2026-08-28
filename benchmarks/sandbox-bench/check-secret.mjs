// P-002 — VÉRIFICATION DU SECRET E2B sans JAMAIS afficher sa valeur.
// Convention du chantier : ~/.deribfy-sandbox-bench.env, mode 600, hors
// dépôt (patron ~/.deribfy-supabase-bench.env). Sortie : présence, mode,
// format plausible (préfixe e2b_), longueur — rien d'autre.
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FILE = join(homedir(), ".deribfy-sandbox-bench.env");
let st;
try {
  st = statSync(FILE);
} catch {
  console.log(JSON.stringify({ fichier: FILE, present: false }));
  process.exit(1);
}
const mode = st.mode & 0o777;
const content = readFileSync(FILE, "utf8");
const m = content.match(/^E2B_API_KEY=(.+)$/m);
const key = m?.[1]?.trim();
const ok = mode === 0o600 && typeof key === "string" && key.length > 10;
console.log(
  JSON.stringify({
    fichier: FILE,
    present: true,
    permissions600: mode === 0o600,
    cleDetectee: typeof key === "string" && key.length > 0,
    formatPlausible: typeof key === "string" && /^e2b_/.test(key),
    longueur: key?.length ?? 0,
  }),
);
process.exit(ok ? 0 : 1);
