// PHASE 11 — le routeur, appliqué au corpus réel.
const R = "/Users/yia/Documents/woorri/";
const { readdirSync, readFileSync } = await import("node:fs");
const { migrateAirDocument } = await import(R + "packages/air-schema/src/migrations.ts");
const { nativeSurface, attemptOta } = await import(R + "packages/router/src/router.ts");

const d = R + "packages/golden-corpus/corpus-v3/";
const docs = readdirSync(d).filter((f) => f.endsWith(".air.json")).sort();
console.log("═".repeat(76));
console.log("PHASE 11 — ROUTAGE OTA / REBUILD PAR EMPREINTE");
console.log("═".repeat(76));
console.log("\n  document              profil     capabilities  modules natifs  empreinte");
console.log("  " + "─".repeat(72));
for (const f of docs) {
  const air = migrateAirDocument(JSON.parse(readFileSync(d + f, "utf8")));
  const s = nativeSurface(air);
  console.log(
    `  ${f.replace(".air.json", "").padEnd(22)}${s.profile.padEnd(11)}${String(s.capabilities.length).padStart(7)}${String(s.nativeModules.length).padStart(14)}   ${s.fingerprint.slice(0, 12)}…`,
  );
}

console.log("\n  ── PREUVE PAR TENTATIVE : que refuse le routeur ? ──");
const air = migrateAirDocument(JSON.parse(readFileSync(d + docs[0], "utf8")));
const ui = JSON.parse(JSON.stringify(air));
const b = ui.screens[0].blocks.find((x) => x.blockType === "button");
if (b?.props) b.props = b.props.map((p) => (p.key === "label" ? { ...p, value: "Autre libellé" } : p));
const natif = JSON.parse(JSON.stringify(air));
natif.capabilities.push({ capability: "camera" });

for (const [nom, apres] of [["changement UI (libellé)", ui], ["ajout de capability `camera`", natif]]) {
  const t = attemptOta(air, apres, "production");
  console.log(`  ${nom.padEnd(34)} ${t.accepted ? "🟢 OTA ACCEPTÉE" : "🔴 OTA REFUSÉE"}`);
  for (const r of t.reasons) console.log(`     ${r}`);
}
