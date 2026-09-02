// E3.3 (D-132) — ÉMISSION DE LA FIXTURE REMOTE pour la preuve au rendu.
// Le document bus du corpus (ARBITRAIRE ici : simple artefact porteur — le
// mécanisme est sector-agnostic) reçoit une provenance distante VALIDE sur
// `data_departs`, est compilé par le VRAI compilateur, écrit sur disque et
// soumis au VRAI `tsc` (patron gate-app-compile, D-074). AUCUN réseau.
const { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, symlinkSync } = await import("node:fs");
const { execFileSync } = await import("node:child_process");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { fileURLToPath } = await import("node:url");
const R = join(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..") + "/";
const { migrateAirDocument } = await import(R + "packages/air-schema/src/migrations.ts");
const { compileProject } = await import(R + "packages/compiler/src/index.ts");

const BASE = R + "slices/resto-riche/app/node_modules";
if (!existsSync(BASE + "/typescript")) {
  console.error("🔴 dépendances empruntées absentes — lancer d'abord `npm run gate:app-compile`");
  process.exit(2);
}

const brut = JSON.parse(readFileSync(R + "packages/golden-corpus/corpus-v3/bus-intercites.air.json", "utf8"));
const air = migrateAirDocument(brut);
const fixture = {
  ...air,
  datasets: air.datasets.map((d) =>
    d.id !== "data_departs"
      ? d
      : {
          ...d,
          sourceKind: "remote",
          sourceIntegrationId: "intg_cache_billets",
          sourceDomain: "api.bus-intercites.app",
          sourceRefreshSeconds: 60,
        },
  ),
};

const slots = air.slots.map((s) => ({
  slotId: s.id,
  source: `export function runSlot(entrees: { valeur?: string }): { resultat: string } {\n  return { resultat: String(entrees.valeur ?? "") };\n}\n`,
  authorId: "gate",
}));
const c = compileProject(fixture, undefined, slots.length > 0 ? { slots } : undefined);

const OUT = join(tmpdir(), "deribfy-e33-remote") + "/";
rmSync(OUT, { recursive: true, force: true });
for (const [f, contenu] of c.files) {
  const p = OUT + f;
  mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true });
  writeFileSync(p, contenu);
}
symlinkSync(BASE, OUT + "node_modules", "dir");
try {
  execFileSync("npx", ["tsc", "--noEmit"], { cwd: OUT, stdio: "pipe", timeout: 180000 });
  console.log(`🟢 fixture remote émise (${c.files.size} fichiers) et tsc EXIT=0 → ${OUT}`);
} catch (e) {
  const sortie = String(e.stdout ?? "") + String(e.stderr ?? "");
  console.error("🔴 l'app remote émise NE COMPILE PAS :");
  console.error(sortie.split("\n").filter((l) => l.includes("error TS")).slice(0, 8).join("\n"));
  process.exit(1);
}
