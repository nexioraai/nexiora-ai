// AUDIT Z-D3 — couverture, limites, exigences 6 et 8. Lecture seule.
const REPO = "/Users/yia/Documents/woorri/";
const { z } = await import(REPO + "node_modules/zod/index.js").catch(() => import("zod"));
const D = (s) => s?._zod?.def ?? s?.def ?? s?._def;
const chk = (c) => c?._zod?.def ?? c?.def ?? c;
function walk(s, path, out, seen = new Set()) {
  const d = D(s); if (!d || seen.has(s)) return; seen = new Set(seen); seen.add(s);
  for (const c of d.checks ?? []) { const cd = chk(c);
    out.push({ path, kind: "CHECK:" + (cd.check ?? "?"), opaque: cd.check === "custom" || typeof cd.fn === "function" }); }
  switch (d.type) {
    case "object": out.push({ path, kind: "STRICTNESS" });
      for (const [k, v] of Object.entries(d.shape ?? {})) walk(v, path ? `${path}.${k}` : k, out, seen); break;
    case "array": walk(d.element, `${path}[]`, out, seen); break;
    case "optional": case "nullable": case "default": case "readonly": walk(d.innerType, path, out, seen); break;
    case "union": case "discriminatedUnion":
      (d.options ?? []).forEach((o, i) => walk(o, `${path}|${i}`, out, seen)); break;
    case "enum": out.push({ path, kind: "ENUM" }); break;
    case "literal": out.push({ path, kind: "LITERAL" }); break;
    case "custom": case "pipe": case "transform": out.push({ path, kind: "OPAQUE:" + d.type, opaque: true }); break;
  }
}
const count = (s) => { const o = []; walk(s, "", o); return o; };

console.log("─── EXIGENCE 8 · stabilité vis-à-vis du CONTENU des données ───");
const arr = z.strictObject({ items: z.array(z.strictObject({ n: z.number().int().min(0) })).min(1) });
const u = count(arr);
console.log("  schéma à tableau → unités :", u.length, "·", u.map((x) => `${x.path || "«r»"}:${x.kind}`).join(" "));
console.log("  ⇒ le décompte est celui du SCHÉMA, jamais du nombre d'éléments à l'exécution");

console.log("\n─── LIMITE · contrainte inter-champs (superRefine) ───");
const cross = z.strictObject({ a: z.string(), b: z.string() })
  .superRefine((v, ctx) => { if (v.a === v.b) ctx.addIssue({ code: "custom", message: "a ≠ b requis" }); });
const cu = count(cross);
console.log("  unités extraites :", cu.length, "·", cu.map((x) => `${x.path || "«r»"}:${x.kind}`).join(" "));
console.log("  opaques :", cu.filter((x) => x.opaque).length, "— le PRÉDICAT lui-même n'est pas introspectable");

console.log("\n─── COUVERTURE · racines de schéma NEUTRES ───");
const roots = [
  ["design-tokens · designTokensSchema", "packages/design-tokens/src/schema.ts", "designTokensSchema"],
  ["air-schema · projectLockSchema", "packages/air-schema/src/lock.ts", "projectLockSchema"],
  ["air-schema · deploymentStateSchema", "packages/air-schema/src/deployment-state.ts", "deploymentStateSchema"],
];
let tot = 0;
for (const [label, file, name] of roots) {
  try { const m = await import(REPO + file); const s = m[name];
    if (!s) { console.log(`  ${label.padEnd(38)} racine introuvable`); continue; }
    const o = count(s); tot += o.length;
    const k = new Map(); for (const x of o) k.set(x.kind.split(":")[0], (k.get(x.kind.split(":")[0]) ?? 0) + 1);
    console.log(`  ${label.padEnd(38)} ${String(o.length).padStart(4)} unités  (${[...k].map(([a, b]) => a + "=" + b).join(" ")})`);
  } catch (e) { console.log(`  ${label.padEnd(38)} ERREUR ${String(e.message).slice(0, 40)}`); }
}
console.log(`  ${"TOTAL neutres".padEnd(38)} ${String(tot).padStart(4)} unités`);

console.log("\n─── MAGNITUDE · contrat AIR (agrégat SEUL, aucun chemin listé) ───");
try {
  const m = await import(REPO + "packages/air-schema/src/air.ts");
  const o = count(m.projectAirSchema);
  const k = new Map(); for (const x of o) k.set(x.kind.split(":")[0], (k.get(x.kind.split(":")[0]) ?? 0) + 1);
  console.log("  projectAirSchema →", o.length, "unités  (" + [...k].map(([a, b]) => a + "=" + b).join(" ") + ")");
  console.log("  opaques :", o.filter((x) => x.opaque).length);
} catch (e) { console.log("  ERREUR", String(e.message).slice(0, 60)); }
console.log("  (aucun chemin de ce contrat n'a été lu ni listé)");
