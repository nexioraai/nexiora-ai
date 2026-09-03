// 4.4 (D-029) — PREUVE RÉELLE DES MANIFESTES : pour un document exigeant
// minAndroidSdk 26 (> plancher 24) et des permissions induites, assembler
// gabarit + émission (app.json RÉEL émis), installer, puis :
//  1. `expo prebuild --platform android` → AndroidManifest.xml contient
//     les permissions induites ET gradle.properties porte minSdk 26
//     (la config native de l'AIR est réellement APPLIQUÉE) ;
//  2. `expo export` ios+android EXIT=0 avec l'app.json émis.
// Journal : results/v44-manifests.jsonl. 0 $.
// Usage : node v44-manifests.mjs <workdir> <doc.air.json>
import { execFileSync } from "node:child_process";
import {
  appendFileSync, copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const TEMPLATE = join(REPO, "packages", "compiler", "template");
const [WORK, doc] = process.argv.slice(2);
if (!WORK || !doc) throw new Error("usage: node v44-manifests.mjs <workdir> <doc>");
const { emitProject } = await import(join(REPO, "packages/compiler/src/emit-project.ts"));

const LOG = join(HERE, "results", "v44-manifests.jsonl");
mkdirSync(join(HERE, "results"), { recursive: true });
const log = (o) => { appendFileSync(LOG, JSON.stringify(o) + "\n"); console.log(JSON.stringify(o)); };
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const air = JSON.parse(readFileSync(join(REPO, "packages/golden-corpus/corpus-v2", doc), "utf8"));
const { files } = emitProject(air);
const dir = join(WORK, doc.replace(/\.air\.json$/, ""));
mkdirSync(dir, { recursive: true });
for (const f of readdirSync(TEMPLATE)) copyFileSync(join(TEMPLATE, f), join(dir, f));
for (const [rel, content] of files) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content);
}
run("npm", ["ci", "--ignore-scripts"], dir);

// 1. Prebuild android : manifeste + config native réellement appliqués.
run("npx", ["expo", "prebuild", "--platform", "android", "--no-install"], dir);
const manifest = readFileSync(join(dir, "android/app/src/main/AndroidManifest.xml"), "utf8");
const gradleProps = readFileSync(join(dir, "android/gradle.properties"), "utf8");
const appJson = JSON.parse(readFileSync(join(dir, "app.json"), "utf8"));
const wantedPerms = appJson.expo.android.permissions;
const permsOk = wantedPerms.every((p) => manifest.includes(`"${p}"`));
const minSdkWanted = appJson.expo.plugins.find((x) => x[0] === "expo-build-properties")[1].android.minSdkVersion;
const minSdkOk = new RegExp(`android.minSdkVersion=${minSdkWanted}\\b`).test(gradleProps);
const packageOk = manifest.includes(appJson.expo.android.package) ||
  readFileSync(join(dir, "android/app/build.gradle"), "utf8").includes(appJson.expo.android.package);
log({ doc, etape: "prebuild-android", wantedPerms, permsOk, minSdkWanted, minSdkOk, packageOk });

// 2. Export avec l'app.json émis.
let exportExit = 0;
try {
  run("npx", ["expo", "export", "--platform", "ios", "--platform", "android", "--output-dir", "dist"], dir);
} catch (e) { exportExit = e.status ?? 1; }
log({ doc, etape: "expo-export", exportExit });

const ok = permsOk && minSdkOk && packageOk && exportExit === 0;
log({ verdict: ok ? "V44 VERTE" : "V44 ÉCHEC" });
process.exitCode = ok ? 0 : 1;
