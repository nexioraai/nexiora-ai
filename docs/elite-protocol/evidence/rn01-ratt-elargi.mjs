// RN-01 · MESURE ÉLARGIE DE R-RATT — 3 racines NEUTRES.
// Traversée DOUBLE et synchrone : schéma (contraintes) × type résolu (représentabilité).
// Lecture seule. Reproductible : node docs/elite-protocol/evidence/rn01-ratt-elargi.mjs
const REPO = "/Users/yia/Documents/woorri/";
const ts = (await import(REPO + "node_modules/typescript/lib/typescript.js")).default;
const D = (s) => s?._zod?.def ?? s?.def;
const chk = (c) => c?._zod?.def ?? c?.def ?? c;

// D-9 : ensemble CLOS des genres représentables dans le type résolu.
const REPRESENTABLE = new Set(["ENUM", "LITERAL", "MODALITY:optional", "MODALITY:nullable"]);

const RACINES = [
  { nom: "designTokensSchema",   pkg: "packages/design-tokens", file: "packages/design-tokens/src/schema.ts",        exp: "designTokensSchema" },
  { nom: "projectLockSchema",    pkg: "packages/air-schema",    file: "packages/air-schema/src/lock.ts",             exp: "projectLockSchema" },
  { nom: "deploymentStateSchema",pkg: "packages/air-schema",    file: "packages/air-schema/src/deployment-state.ts", exp: "deploymentStateSchema" },
];

function typeOfRoot(r) {
  const cfg = ts.readConfigFile(REPO + r.pkg + "/tsconfig.json", ts.sys.readFile);
  if (cfg.error) return null;
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, REPO + r.pkg);
  const prog = ts.createProgram([REPO + r.file], parsed.options);
  const ck = prog.getTypeChecker();
  const sf = prog.getSourceFile(REPO + r.file);
  if (!sf) return null;
  let decl = null;
  ts.forEachChild(sf, (n) => { if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations)
    if (d.name.getText(sf) === r.exp) decl = d; });
  if (!decl) return null;
  const t = ck.getTypeAtLocation(decl.name);
  const outSym = t.getProperty("_output");
  if (!outSym) return null;
  return { ck, decl, type: ck.getTypeOfSymbolAtLocation(outSym, decl) };
}

function elementType(ck, t) {
  const args = ck.getTypeArguments?.(t) ?? [];
  if (args.length) return args[0];
  return ck.getIndexTypeOfType?.(t, 1) ?? undefined; // 1 = IndexKind.Number
}

/** Traversée double : émet une unité par contrainte, annotée du verdict R-RATT. */
function walk(schema, type, path, ctx, out, parentOpt = false, seen = new Set()) {
  const d = D(schema); if (!d || seen.has(schema)) return; seen = new Set(seen); seen.add(schema);
  const { ck } = ctx;
  const txt = type ? ck.typeToString(type) : null;

  const emit = (kind, detail) => {
    const repr = REPRESENTABLE.has(kind);
    let effect = false, resolved = type !== undefined;
    if (repr && resolved) {
      if (kind === "ENUM") effect = detail.split("|").every((e) => txt.includes(`"${e}"`));
      else if (kind === "LITERAL") effect = txt.includes(`"${detail}"`);
      else if (kind === "MODALITY:optional") effect = parentOpt === true || txt.includes("undefined");
      else if (kind === "MODALITY:nullable") effect = txt.includes("null");
    }
    out.push({ path, kind, detail, repr, effect, resolved,
      verdict: !resolved ? "NON RÉSOLU" : (repr && effect) ? "RATTACHÉE" : "AUTONOME" });
  };

  for (const c of d.checks ?? []) { const cd = chk(c);
    emit("CHECK:" + cd.check, String(cd.pattern ?? cd.value ?? cd.minimum ?? cd.maximum ?? "")); }

  switch (d.type) {
    case "object": {
      emit("STRICTNESS", d.catchall === undefined ? "ouvert" : "strict");
      for (const [k, v] of Object.entries(d.shape ?? {})) {
        const sym = type ? type.getProperty(k) : undefined;
        const opt = sym ? (sym.flags & ts.SymbolFlags.Optional) !== 0 : false;
        // CORRECTIF D'INSTRUMENT (2026-08-30) : un membre optionnel a pour type
        // `T | undefined` ; `getProperty` y échoue. On retire la nullité AVANT de
        // descendre. La règle R-RATT est inchangée — seul l'outil l'était.
        let pt = sym ? ck.getTypeOfSymbolAtLocation(sym, ctx.decl) : undefined;
        if (pt) pt = ck.getNonNullableType(pt);
        walk(v, pt, path ? `${path}.${k}` : k, ctx, out, opt, seen);
      } break; }
    case "array": walk(d.element, type ? elementType(ck, type) : undefined, `${path}[]`, ctx, out, false, seen); break;
    case "optional": case "nullable": case "default":
      emit("MODALITY:" + d.type, ""); walk(d.innerType, type, path, ctx, out, parentOpt, seen); break;
    case "union": case "discriminatedUnion":
      (d.options ?? []).forEach((o, i) => walk(o, undefined, `${path}|${i}`, ctx, out, false, seen)); break;
    case "enum":    emit("ENUM", Object.values(d.entries ?? {}).join("|")); break;
    case "literal": emit("LITERAL", String((d.values ?? [])[0])); break;
  }
}

async function mesure(r) {
  const ctx = typeOfRoot(r);
  if (!ctx) return { nom: r.nom, err: "type racine non résolu" };
  const mod = await import(REPO + r.file);
  const out = []; walk(mod[r.exp], ctx.type, "", ctx, out);
  return { nom: r.nom, out };
}

const all = [];
for (const r of RACINES) all.push(await mesure(r));

console.log("═".repeat(92));
console.log("R-RATT — MESURE ÉLARGIE sur 3 racines NEUTRES (ni chemin D004, ni chemin D005)");
console.log("═".repeat(92));
let T = { u: 0, r: 0, a: 0, n: 0, s: 0 };
for (const m of all) {
  if (m.err) { console.log(`\n── ${m.nom} : ${m.err}`); continue; }
  const R = m.out.filter((x) => x.verdict === "RATTACHÉE");
  const A = m.out.filter((x) => x.verdict === "AUTONOME");
  const N = m.out.filter((x) => x.verdict === "NON RÉSOLU");
  const S = m.out.filter((x) => x.kind === "STRICTNESS");
  T.u += m.out.length; T.r += R.length; T.a += A.length; T.n += N.length; T.s += S.length;
  console.log(`\n── ${m.nom}`);
  console.log(`   unités : ${m.out.length}   RATTACHÉE : ${R.length}   AUTONOME : ${A.length}   NON RÉSOLU : ${N.length}`);
  console.log(`   dont STRICTNESS (toujours autonome, recouvrement résiduel) : ${S.length}`);
  const parGenre = new Map();
  for (const x of R) parGenre.set(x.kind, (parGenre.get(x.kind) ?? 0) + 1);
  if (parGenre.size) console.log(`   rattachées par genre : ${[...parGenre].map(([k, v]) => `${k}=${v}`).join(" · ")}`);
  R.slice(0, 4).forEach((x) => console.log(`      🟢 ${x.path || "«racine»"} · ${x.kind}`));
}
console.log("\n" + "─".repeat(92));
console.log(`TOTAL  unités=${T.u}  RATTACHÉE=${T.r} (${(100 * T.r / T.u).toFixed(1)} %)  AUTONOME=${T.a}  NON RÉSOLU=${T.n}`);
console.log(`RECOUVREMENT RÉSIDUEL — STRICTNESS jamais rattachable : ${T.s} unités (${(100 * T.s / T.u).toFixed(1)} %)`);

// ── STABILITÉ DE LA FRONTIÈRE : seconde passe complète.
const all2 = []; for (const r of RACINES) all2.push(await mesure(r));
const key = (m) => m.err ? m.err : m.out.map((x) => `${x.path}|${x.kind}|${x.detail}|${x.verdict}`).join(";");
const stable = all.every((m, i) => key(m) === key(all2[i]));
const n1 = all.reduce((a, m) => a + (m.out?.length ?? 0), 0), n2 = all2.reduce((a, m) => a + (m.out?.length ?? 0), 0);
console.log(`\nSTABILITÉ  passe1=${n1}  passe2=${n2}  frontières ET verdicts identiques : ${stable ? "🟢 oui" : "🔴 NON"}`);
