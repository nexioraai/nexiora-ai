const R="/Users/yia/Documents/woorri/";
const {readFileSync,readdirSync}=await import("node:fs");
const {migrateAirDocument}=await import(R+"packages/air-schema/src/migrations.ts");
const {EXECUTION_ENVELOPE_V1:ENV}=await import(R+"packages/execution-contract/src/envelope.ts");
const {evaluatePromises}=await import(R+"packages/fidelity/src/promises.ts");
const {evaluateIntentCoverage}=await import(R+"packages/fidelity/src/intent.ts");

const docs=[...readdirSync(R+"packages/golden-corpus/corpus-v2").filter(f=>f.endsWith(".air.json"))
  .map(f=>[f.replace(".air.json",""),R+"packages/golden-corpus/corpus-v2/"+f]),
  ["resto-riche",R+"slices/resto-riche/chez-nous.air.json"]];
console.log("═".repeat(84));
console.log("GATES DE FIDÉLITÉ — PHASE 10B · F1 promesses · F4 couverture demande→AIR");
console.log("═".repeat(84));
console.log("\n  document                F1 promesses          F4 couverture           VERDICT");
console.log("  " + "─".repeat(80));
let ok=0;
for(const [nom,p] of docs){
  const air=migrateAirDocument(JSON.parse(readFileSync(p,"utf8")));
  const f1=evaluatePromises(air,ENV), f4=evaluateIntentCoverage(air,ENV);
  const pass=f1.passed&&f4.passed; if(pass) ok++;
  const c1=`${f1.vivantes}/${f1.declared} vivantes`.padEnd(20);
  const c4=(f4.present?`${f4.satisfaits} ok · ${f4.inexprimables} dits · ${f4.defaillants} KO`:"pas d'intention").padEnd(22);
  console.log(`  ${nom.padEnd(22)} ${f1.passed?"🟢":"🔴"} ${c1}${f4.passed?"🟢":"🔴"} ${c4}${pass?"🟢 FIDÈLE":"🔴 REFUSÉ"}`);
}
console.log(`\n  ${ok} document(s) sur ${docs.length} passent les deux gates.`);
const rr=migrateAirDocument(JSON.parse(readFileSync(R+"slices/resto-riche/chez-nous.air.json","utf8")));
console.log("\n── resto-riche : les besoins qui DISPARAISSAIENT, maintenant DITS");
for(const v of evaluateIntentCoverage(rr,ENV).verdicts.filter(v=>v.state==="inexprimable"))
  console.log(`   🟠 « ${v.statement} »\n      → ${v.motif.slice(0,96)}…`);
