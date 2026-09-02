// BATTERIE PRÉ-BUILD (arbitrage §4) — à REJOUER avant tout build EAS.
// Vérifie : LOCK (endpoint résolu, version), allowlist, câblage remote émis,
// impossibilité de sortir du domaine, disjonction seed/serveur (aucune donnée
// de démo ne peut passer pour distante), forme des fichiers d'endpoint,
// billets scopés cohérents, tsc RÉEL de l'app émise. AUCUN réseau, 0 $.
import { readFileSync, existsSync, symlinkSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const ICI = join(fileURLToPath(import.meta.url), "..");
const R = join(ICI, "..", "..") + "/";
const { migrateAirDocument } = await import(R + "packages/air-schema/src/migrations.ts");
const { resolveLock } = await import(R + "packages/compiler/src/resolve-lock.ts");
const { DOMAINE, REFRESH_SECONDS } = await import(join(ICI, "construire-fixture.mjs"));

let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`  ${ok ? "🟢" : "🔴"} ${nom}${detail ? " — " + detail : ""}`);
  if (!ok) echecs++;
};

const air = migrateAirDocument(JSON.parse(readFileSync(join(ICI, "validation-appareil.air.json"), "utf8")));

// 1. LOCK : endpoint résolu au protocole moteur, version 1.1.0.
const lock = resolveLock(air);
const cible = (lock.resolved.remoteData ?? [])[0];
check("lock 1.1.0", lock.lockSchemaVersion === "1.1.0", lock.lockSchemaVersion);
check("UNE cible remote résolue", (lock.resolved.remoteData ?? []).length === 1);
check("endpoint exact", cible?.url === `https://${DOMAINE}/air/v1/entities/ent_depart/rows`, cible?.url);
check("refreshSeconds conforme", cible?.refreshSeconds === REFRESH_SECONDS);
check("intégration liée", cible?.integrationId === "intg_cache_billets");

// 2. Allowlist : domaine gravé, et AUCUNE cible hors allowlist possible.
check("domaine dans allowedDomains", air.network.allowedDomains.includes(DOMAINE));
const horsListe = (lock.resolved.remoteData ?? []).filter(
  (c) => !air.network.allowedDomains.includes(new URL(c.url).hostname),
);
check("0 cible hors allowlist", horsListe.length === 0);

// 3. Câblage émis : magasin + adaptateur + cibles du lock + politique.
const app = readFileSync(join(ICI, "app", "App.tsx"), "utf8");
check("App émise câble le magasin", app.includes("const provider = creerMagasin(demoData);"));
check("App émise câble l'adaptateur", app.includes("creerAdaptateurReseau"));
check("cibles du LOCK gravées", app.includes(`https://${DOMAINE}/air/v1/entities/ent_depart/rows`));
check("politique de domaines gravée", app.includes(`"${DOMAINE}"`) && app.includes("DOMAINES_AUTORISES"));
check("runtime réseau embarqué", existsSync(join(ICI, "app", "lib", "runtime", "source-reseau.ts")));

// 4. Seed ≠ distant : les valeurs servies sont DISJOINTES des valeurs de démo
// (mêmes ids — le backend représente les mêmes entités — mais aucune valeur
// de destination de démo ne peut être confondue avec une valeur serveur).
const demo = readFileSync(join(ICI, "app", "demo.data.ts"), "utf8");
const lireRows = (f) => JSON.parse(readFileSync(join(ICI, "endpoint", "air", "v1", "entities", "ent_depart", f), "utf8"));
for (const fichier of ["rows", "rows.apres-modification"]) {
  const rows = lireRows(fichier);
  const forme = rows.every(
    (r) => typeof r.id === "string" && r.values && Object.values(r.values).every((v) => typeof v === "string"),
  );
  check(`${fichier} : forme EntityInstance[]`, forme, `${rows.length} lignes`);
  const collisions = rows.filter((r) => demo.includes(`"fld_depart_destination":"${r.values.fld_depart_destination}"`));
  check(`${fichier} : destinations serveur ABSENTES de la démo`, collisions.length === 0);
}
// La modification v1→v2 est réelle et observable.
const v1 = lireRows("rows"), v2 = lireRows("rows.apres-modification");
const bouake1 = v1.find((r) => r.id === "ent_depart_row_1"), bouake2 = v2.find((r) => r.id === "ent_depart_row_1");
check("v2 modifie une ligne existante", bouake1.values.fld_depart_prix !== bouake2.values.fld_depart_prix);
check("v2 ajoute une ligne nouvelle", v2.length === v1.length + 1 && v2.some((r) => r.id === "ent_depart_row_99"));

// 5. E2 : cartographie attendue sur appareil (table de session).
const billets = [...demo.matchAll(/"fld_billet_depart":"(ent_depart_row_\d+)"/g)].map((m) => m[1]);
console.log("\n  TABLE E2 (départ servi → billets de démo attendus au détail) :");
for (const r of v1) {
  const n = billets.filter((b) => b === r.id).length;
  console.log(`    ${r.values.fld_depart_destination.padEnd(14)} (${r.id}) → ${n} billet(s)${n === 0 ? "  [VIDE attendu]" : ""}`);
}

// 6. tsc RÉEL de l'app émise (dépendances empruntées, patron D-074).
const BASE = R + "slices/resto-riche/app/node_modules";
check("dépendances empruntables présentes", existsSync(BASE + "/typescript"));
const lien = join(ICI, "app", "node_modules");
rmSync(lien, { force: true });
symlinkSync(BASE, lien, "dir");
try {
  execFileSync("npx", ["tsc", "--noEmit"], { cwd: join(ICI, "app"), stdio: "pipe", timeout: 180000 });
  check("tsc app émise", true, "EXIT=0");
} catch (e) {
  const lignes = String(e.stdout ?? "").split("\n").filter((l) => l.includes("error TS"));
  check("tsc app émise", false, lignes[0] ?? "sortie vide");
}
// Démontage du lien : un SYMLINK n'est pas couvert par le motif
// `node_modules/` du .gitignore émis — le laisser ferait entrer un chemin
// absolu machine dans un futur `git add`.
rmSync(lien, { force: true });

console.log(`\n${echecs === 0 ? "🟢 PRÉ-BUILD : TOUT EST VERT — build EAS autorisable" : `🔴 ${echecs} échec(s) — NE PAS BUILDER`}`);
process.exitCode = echecs === 0 ? 0 : 1;
