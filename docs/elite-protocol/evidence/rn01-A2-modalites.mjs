// A-2 — une modalité est-elle une unité de R-GRAN-2 ?
// Lecture seule. node docs/elite-protocol/evidence/rn01-A2-modalites.mjs
const REPO = "/Users/yia/Documents/woorri/";
const ts = (await import(REPO + "node_modules/typescript/lib/typescript.js")).default;
const { z } = await import(REPO + "node_modules/zod/index.js");
const { readFileSync } = await import("node:fs");

// ── 1. OCCURRENCES RÉELLES dans le périmètre SOURCE (D-2)
const SRC = ["packages/air-schema/src/air.ts","packages/air-schema/src/ids.ts","packages/air-schema/src/lock.ts",
  "packages/air-schema/src/deployment-state.ts","packages/blocks/src/definitions.ts",
  "packages/design-tokens/src/schema.ts","packages/capability-registry/src/definitions.ts",
  "packages/execution-contract/src/envelope.ts"];
const tally = { optional: 0, nullable: 0, default: 0 };
for (const f of SRC) {
  let src; try { src = readFileSync(REPO + f, "utf8"); } catch { continue; }
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const v = (n) => { if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const m = n.expression.name.text; if (m in tally) tally[m]++; } ts.forEachChild(n, v); };
  v(sf);
}
console.log("═".repeat(84));
console.log("1 · OCCURRENCES DANS LE PÉRIMÈTRE SOURCE");
console.log("═".repeat(84));
for (const [k, v] of Object.entries(tally)) console.log(`  .${k}()`.padEnd(16), v, "occurrence(s)");

// ── 2. LES TROIS FORMES ONT-ELLES LE MÊME PORTEUR ?
console.log("\n" + "═".repeat(84));
console.log("2 · PORTEUR STRUCTUREL — symbole du membre  vs  type de la valeur");
console.log("═".repeat(84));
const probe = `import { z } from "zod";
export const S = z.strictObject({
  opt: z.string().optional(),
  nul: z.string().nullable(),
  def: z.string().default("x"),
  req: z.string(),
});`;
const tmp = REPO + "packages/air-schema/src/__a2_probe.ts";
const { writeFileSync, rmSync } = await import("node:fs");
writeFileSync(tmp, probe);
try {
  const cfg = ts.readConfigFile(REPO + "packages/air-schema/tsconfig.json", ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, REPO + "packages/air-schema");
  const prog = ts.createProgram([tmp], parsed.options);
  const ck = prog.getTypeChecker(); const sf = prog.getSourceFile(tmp);
  let decl = null;
  ts.forEachChild(sf, (n) => { if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations)
    if (d.name.getText(sf) === "S") decl = d; });
  const t = ck.getTypeAtLocation(decl.name);
  const outT = ck.getTypeOfSymbolAtLocation(t.getProperty("_output"), decl);
  const inT = ck.getTypeOfSymbolAtLocation(t.getProperty("_input"), decl);
  console.log("  membre   | symbole OPTIONNEL (sortie) | type de sortie          | type d'entrée");
  console.log("  " + "─".repeat(78));
  for (const nom of ["opt", "nul", "def", "req"]) {
    const so = outT.getProperty(nom), si = inT.getProperty(nom);
    const fo = so ? (so.flags & ts.SymbolFlags.Optional) !== 0 : null;
    const fi = si ? (si.flags & ts.SymbolFlags.Optional) !== 0 : null;
    const to = so ? ck.typeToString(ck.getTypeOfSymbolAtLocation(so, decl)) : "—";
    console.log(`  ${nom.padEnd(8)} | ${String(fo).padEnd(25)} | ${to.padEnd(23)} | optionnel=${fi}`);
  }
} finally { rmSync(tmp, { force: true }); }

// ── 3. STABILITÉ DE LA FRONTIÈRE sur exemples neutres
console.log("\n" + "═".repeat(84));
console.log("3 · STABILITÉ — trois écritures NEUTRES du « membre absent possible »");
console.log("═".repeat(84));
const D = (s) => s?._zod?.def ?? s?.def;
const shapeInfo = (s) => { const d = D(s); return { type: d.type, aInner: d.innerType !== undefined,
  aDefault: d.defaultValue !== undefined || d.defaultValue === null }; };
for (const [nom, sch] of [["z.string().optional()", z.string().optional()],
                          ["z.string().nullable()", z.string().nullable()],
                          ["z.string().default('x')", z.string().default("x")],
                          ["z.union([string, undefined])", z.union([z.string(), z.undefined()])]]) {
  const i = shapeInfo(sch);
  console.log(`  ${nom.padEnd(30)} def.type = ${String(i.type).padEnd(10)} innerType=${i.aInner}`);
}

// ── 4. CONSÉQUENCE NUMÉRIQUE de chaque option, sur les 3 racines neutres
console.log("\n" + "═".repeat(84));
console.log("4 · CONSÉQUENCE NUMÉRIQUE sur les 3 racines neutres");
console.log("═".repeat(84));
const chk = (c) => c?._zod?.def ?? c?.def ?? c;
function walk(s, p, o, seen = new Set()) {
  const d = D(s); if (!d || seen.has(s)) return; seen = new Set(seen); seen.add(s);
  for (const c of d.checks ?? []) o.push({ p, kind: "CHECK:" + chk(c).check });
  switch (d.type) {
    case "object": o.push({ p, kind: "STRICTNESS" });
      for (const [k, v] of Object.entries(d.shape ?? {})) walk(v, p ? `${p}.${k}` : k, o, seen); break;
    case "array": walk(d.element, `${p}[]`, o, seen); break;
    case "optional": case "nullable": case "default":
      o.push({ p, kind: "MODALITY:" + d.type }); walk(d.innerType, p, o, seen); break;
    case "union": case "discriminatedUnion": (d.options ?? []).forEach((x, i) => walk(x, `${p}|${i}`, o, seen)); break;
    case "enum": o.push({ p, kind: "ENUM" }); break;
    case "literal": o.push({ p, kind: "LITERAL" }); break;
  }
}
const roots = [["designTokensSchema","packages/design-tokens/src/schema.ts"],
               ["projectLockSchema","packages/air-schema/src/lock.ts"],
               ["deploymentStateSchema","packages/air-schema/src/deployment-state.ts"]];
let A = 0, B = 0;
for (const [exp, file] of roots) {
  const m = await import(REPO + file); const o = []; walk(m[exp], "", o);
  const mods = o.filter((x) => x.kind.startsWith("MODALITY"));
  const optOnly = o.filter((x) => x.kind === "MODALITY:optional");
  A += o.length; B += o.length - optOnly.length;
  console.log(`  ${exp.padEnd(24)} avec modalités = ${String(o.length).padStart(3)}   sans MODALITY:optional = ${String(o.length - optOnly.length).padStart(3)}   (modalités : ${mods.map(x=>x.kind.split(":")[1]).join(",") || "aucune"})`);
}
console.log(`  ${"TOTAL".padEnd(24)} A = ${A}   B = ${B}   écart = ${A - B}`);

// ── 5. LE PORTEUR EST-IL STABLE ? dépendance aux options de compilation
console.log("\n" + "═".repeat(84));
console.log("5 · STABILITÉ DU PORTEUR — dépendance à `exactOptionalPropertyTypes`");
console.log("═".repeat(84));
{
  const { writeFileSync, rmSync } = await import("node:fs");
  const f = REPO + "packages/air-schema/src/__a2_probe2.ts";
  writeFileSync(f, `export interface P { opt?: string; nul: string | null; req: string; }
export declare const p: P;`);
  try {
    for (const exact of [false, true]) {
      const prog = ts.createProgram([f], { strict: true, exactOptionalPropertyTypes: exact,
        target: ts.ScriptTarget.ES2022, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext });
      const ck = prog.getTypeChecker(); const sf = prog.getSourceFile(f);
      let d = null; ts.forEachChild(sf, (n) => { if (ts.isInterfaceDeclaration(n) && n.name.text === "P") d = n; });
      const t = ck.getTypeAtLocation(d.name);
      const ligne = ["opt", "nul", "req"].map((k) => {
        const s = t.getProperty(k);
        const flag = (s.flags & ts.SymbolFlags.Optional) !== 0;
        return `${k}: drapeau=${String(flag).padEnd(5)} type=${ck.typeToString(ck.getTypeOfSymbolAtLocation(s, d)).padEnd(18)}`;
      }).join(" | ");
      console.log(`  exactOptionalPropertyTypes=${String(exact).padEnd(5)}  ${ligne}`);
    }
  } finally { rmSync(f, { force: true }); }
}
