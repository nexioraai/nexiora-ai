// ARBITRAGES B (ZV2) et C (rattachement inter-espaces). Lecture seule.
const REPO = "/Users/yia/Documents/woorri/";
const { z } = await import(REPO + "node_modules/zod/index.js").catch(() => import("zod"));
const D = (s) => s?._zod?.def ?? s?.def;
const chk = (c) => c?._zod?.def ?? c?.def ?? c;

function walk(s, p, o, seen = new Set()) {
  const d = D(s); if (!d || seen.has(s)) return; seen = new Set(seen); seen.add(s);
  for (const c of d.checks ?? []) { const cd = chk(c);
    o.push({ p, kind: "CHECK:" + cd.check, obj: s, detail: String(cd.pattern ?? cd.value ?? cd.minimum ?? "") }); }
  switch (d.type) {
    case "object": for (const [k, v] of Object.entries(d.shape ?? {})) walk(v, p ? `${p}.${k}` : k, o, seen); break;
    case "array": walk(d.element, `${p}[]`, o, seen); break;
    case "optional": case "nullable": case "default":
      o.push({ p, kind: "MODALITY:" + d.type, obj: s, detail: "" }); walk(d.innerType, p, o, seen); break;
    case "union": case "discriminatedUnion":
      (d.options ?? []).forEach((x, i) => walk(x, `${p}|${i}`, o, seen)); break;
    case "enum": o.push({ p, kind: "ENUM", obj: s, detail: Object.values(d.entries ?? {}).join("|") }); break;
    case "literal": o.push({ p, kind: "LITERAL", obj: s, detail: String((d.values ?? [])[0]) }); break;
  }
}

// ═══ B · ZV2 — stabilité sous extraction d'un alias partagé ═══
console.log("═".repeat(84));
console.log("B · ZV2 — la règle (racine, chemin) est-elle stable sous factorisation ?");
console.log("═".repeat(84));
const hex = z.string().regex(/^#[0-9A-F]{6}$/);
const AVEC_ALIAS = z.strictObject({ a: hex, b: hex, c: hex });                       // 1 objet partagé ×3
const INLINE = z.strictObject({                                                       // 3 objets distincts
  a: z.string().regex(/^#[0-9A-F]{6}$/), b: z.string().regex(/^#[0-9A-F]{6}$/), c: z.string().regex(/^#[0-9A-F]{6}$/) });
for (const [nom, sch] of [["avec alias partagé", AVEC_ALIAS], ["alias déplié (inline)", INLINE]]) {
  const o = []; walk(sch, "", o);
  const parChemin = new Set(o.map((u) => `${u.p}|${u.kind}|${u.detail}`)).size;
  const parIdentite = new Set(o.map((u) => u.obj)).size;
  console.log(`  ${nom.padEnd(24)} unités (racine,chemin) = ${parChemin}   ·   dédup. par identité d'objet = ${parIdentite}`);
}
console.log("\n  ⇒ (racine, chemin) : STABLE — le décompte ne bouge pas sous factorisation");
console.log("  ⇒ identité d'objet : INSTABLE — le décompte dépend du style d'écriture");

// Limite : ordre des branches d'union
const U1 = z.strictObject({ v: z.union([z.string(), z.number()]) });
const U2 = z.strictObject({ v: z.union([z.number(), z.string()]) });
const p1 = []; walk(U1, "", p1); const p2 = []; walk(U2, "", p2);
console.log("\n  LIMITE mesurée — réordonnancement des branches d'union :");
console.log("    ordre A → chemins :", [...new Set(p1.map((u) => u.p))].join(", ") || "(aucun check)");
console.log("    ordre B → chemins :", [...new Set(p2.map((u) => u.p))].join(", ") || "(aucun check)");

// ═══ C · RATTACHEMENT INTER-ESPACES ═══
console.log("\n" + "═".repeat(84));
console.log("C · RATTACHEMENT — critère : la contrainte est-elle REPRÉSENTÉE dans le type résolu ?");
console.log("═".repeat(84));
const ts = (await import(REPO + "node_modules/typescript/lib/typescript.js")).default;
const cfg = ts.readConfigFile(REPO + "packages/air-schema/tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, REPO + "packages/air-schema");
const prog = ts.createProgram([REPO + "packages/air-schema/src/air.ts"], parsed.options);
const ck = prog.getTypeChecker();
const sf = prog.getSourceFile(REPO + "packages/air-schema/src/air.ts");
let decl = null;
ts.forEachChild(sf, (n) => { if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations)
  if (d.name.getText(sf) === "ruleAssertionSchema") decl = d; });
const t = ck.getTypeAtLocation(decl.name);
const outT = ck.getTypeOfSymbolAtLocation(t.getProperty("_output"), decl);
const typeMembers = new Map();
for (const p of ck.getPropertiesOfType(outT)) {
  const pt = ck.getTypeOfSymbolAtLocation(p, decl);
  typeMembers.set(p.name, { txt: ck.typeToString(pt), opt: (p.flags & ts.SymbolFlags.Optional) !== 0 });
}
const air = await import(REPO + "packages/air-schema/src/air.ts");
// racine neutre : ruleAssertionSchema, atteinte via air.rules[].assertions[]
const ruleUnits = [];
walk(air.projectAirSchema, "", ruleUnits);
const cible = ruleUnits.filter((u) => u.p.startsWith("rules[].assertions[]"));
const REPRESENTABLE = new Set(["ENUM", "LITERAL", "MODALITY:optional", "MODALITY:nullable"]);
console.log("  membres du type résolu :", [...typeMembers].map(([k, v]) => `${k}${v.opt ? "?" : ""}`).join(" · "));
console.log("\n  unité U-VAL                                     représentable  représentée  RATTACHEMENT");
for (const u of cible) {
  const champ = u.p.split(".").pop();
  const tm = typeMembers.get(champ);
  const repr = REPRESENTABLE.has(u.kind);
  let effect = false;
  if (repr && tm) {
    if (u.kind === "ENUM") effect = u.detail.split("|").every((e) => tm.txt.includes(`"${e}"`));
    if (u.kind === "MODALITY:optional") effect = tm.opt === true;
    if (u.kind === "LITERAL") effect = tm.txt.includes(`"${u.detail}"`);
  }
  console.log(`  ${(u.p + " · " + u.kind).padEnd(48)} ${(repr ? "oui" : "non").padEnd(14)} ${(effect ? "oui" : "non").padEnd(12)} ${repr && effect ? "🟢 RATTACHÉE" : "⚪ AUTONOME"}`);
}
