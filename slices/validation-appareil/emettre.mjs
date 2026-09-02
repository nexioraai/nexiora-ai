// ÉMISSION de l'app de validation par le VRAI compilateur (aucun mock,
// aucune branche « appareil ») — patron gate-app-compile (D-074).
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const ICI = join(fileURLToPath(import.meta.url), "..");
const R = join(ICI, "..", "..") + "/";
const { migrateAirDocument } = await import(R + "packages/air-schema/src/migrations.ts");
const { compileProject } = await import(R + "packages/compiler/src/index.ts");

const air = migrateAirDocument(JSON.parse(readFileSync(join(ICI, "validation-appareil.air.json"), "utf8")));
const slots = air.slots.map((s) => ({
  slotId: s.id,
  source: `export function runSlot(entrees: { valeur?: string }): { resultat: string } {\n  return { resultat: String(entrees.valeur ?? "") };\n}\n`,
  authorId: "validation-appareil",
}));
const c = compileProject(air, undefined, slots.length > 0 ? { slots } : undefined);

const APP = join(ICI, "app") + "/";
rmSync(APP, { recursive: true, force: true });
for (const [f, contenu] of c.files) {
  const p = APP + f;
  mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true });
  writeFileSync(p, contenu);
}
// Profil EAS : patron v3-resto-quartier (APK interne). AUCUN build lancé ici.
writeFileSync(APP + "eas.json", JSON.stringify({
  cli: { version: ">= 16.0.0", appVersionSource: "local" },
  build: { preview: { distribution: "internal", android: { buildType: "apk" } } },
}, null, 2) + "\n");
console.log(`🟢 app émise : ${c.files.size} fichiers · rootHash ${c.rootHash.slice(0, 12)}… · lock ${c.lock.lockSchemaVersion}`);
