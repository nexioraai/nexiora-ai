// PROVISIONNEMENT DU BACKEND DE L'APP DE VALIDATION (D-004 / D-032 :
// un projet Supabase PAR APP, jamais le projet cœur de Deribfy).
//
// Ce script CRÉE un projet réel, y applique le SQL dérivé du document, relève
// la clé anonyme, et ÉCRIT l'intégration d'authentification dans l'AIR. Il ne
// démonte pas (`keep`) : le projet est destiné à vivre.
//
// SECRET : le jeton n'est JAMAIS en argument de ligne de commande (il
// resterait dans l'historique du shell) ni journalisé. Il est lu dans un
// fichier hors dépôt, dont ce script vérifie les permissions.
//
// Usage : node --experimental-strip-types slices/validation-appareil/provisionner.mjs <org-slug>
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = join(fileURLToPath(import.meta.url), "..");
const R = join(ICI, "..", "..") + "/";
const JETON = join(homedir(), ".deribfy-supabase-token");

const orgSlug = process.argv[2];
if (orgSlug === undefined || orgSlug === "") {
  console.error("🔴 slug d'organisation manquant.");
  console.error("   node --experimental-strip-types slices/validation-appareil/provisionner.mjs <org-slug>");
  process.exit(1);
}

let token;
try {
  const st = statSync(JETON);
  // Un secret lisible par tous n'est pas un secret : on refuse, on ne corrige
  // pas en silence.
  if ((st.mode & 0o077) !== 0) {
    console.error(`🔴 ${JETON} est lisible par d'autres comptes. Exécutez : chmod 600 ${JETON}`);
    process.exit(1);
  }
  token = readFileSync(JETON, "utf8").trim();
} catch {
  console.error(`🔴 jeton introuvable — créez ${JETON} (voir le mode d'emploi).`);
  process.exit(1);
}
if (!token.startsWith("sbp_")) {
  console.error("🔴 ce n'est pas un jeton Management API Supabase (attendu : préfixe `sbp_`).");
  process.exit(1);
}

const { migrateAirDocument } = await import(R + "packages/air-schema/src/index.ts");
const { generateProvisioningSql } = await import(R + "packages/provisioner/src/index.ts");
const { SupabaseProvider, runProvisioning } = await import(R + "packages/provisioner/src/index.ts");

const CHEMIN_AIR = join(ICI, "validation-appareil.air.json");
const brut = JSON.parse(readFileSync(CHEMIN_AIR, "utf8"));
const air = migrateAirDocument(brut);
const { sql, summary } = generateProvisioningSql(air);
console.log(`  document : ${air.app.name} · tables : ${summary.tables.join(", ")}`);
console.log(`  org      : ${orgSlug}`);

const provider = new SupabaseProvider({ token, orgSlug });
const rapport = await runProvisioning(provider, {
  name: `deribfy-${air.app.slug}`,
  sql,
  healthTimeoutMs: 300000,
  keep: true, // le projet doit VIVRE : c'est le backend de l'app.
});

for (const e of rapport.steps) {
  console.log(`  ${e.ok ? "🟢" : "🔴"} ${e.step.padEnd(10)} ${e.detail ?? ""}`);
}
if (!rapport.ok) {
  console.error("\n🔴 PROVISIONNEMENT ÉCHOUÉ — rien n'est écrit dans le document.");
  process.exit(1);
}

// La clé est relevée ICI : le rapport de flux ne la porte pas (il journalise
// sa longueur, jamais sa valeur). Vérifié dans `flow.ts`, pas supposé.
const anonKey = await provider.getAnonKey(rapport.ref);
if (anonKey.length === 0) {
  console.error("🔴 clé anonyme vide — rien n'est écrit dans le document.");
  process.exit(1);
}

// L'intégration est écrite APRÈS succès seulement. `anonKey` est publiable par
// conception (protégée par RLS) : c'est ce qui ship dans tout client Supabase.
const url = rapport.restUrl.replace(/\/rest\/v1\/?$/, "");
brut.integrations = [
  ...brut.integrations.filter((i) => i.id !== "intg_auth"),
  {
    id: "intg_auth",
    providerClass: "auth",
    capability: "auth",
    config: [
      { key: "url", value: url },
      { key: "anonKey", value: anonKey },
    ],
  },
];
const hote = new URL(url).hostname;
if (!brut.network.allowedDomains.includes(hote)) {
  // Politique fail-closed : sans l'hôte en allowlist, l'app REFUSERAIT son
  // propre backend.
  brut.network.allowedDomains = [...brut.network.allowedDomains, hote].sort();
}
writeFileSync(CHEMIN_AIR, JSON.stringify(brut, null, 2) + "\n");
console.log(`\n🟢 PROJET VIVANT · ${url}`);
console.log("   intégration `intg_auth` écrite dans le document · hôte ajouté à l'allowlist");
console.log("   suite : node slices/validation-appareil/emettre.mjs && node slices/validation-appareil/verifier.mjs");
