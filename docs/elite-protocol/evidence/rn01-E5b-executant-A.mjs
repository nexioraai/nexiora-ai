// ÉTAPE 5 (rejeu) · EXÉCUTANT A — R-GRAN-2 avec D-13, D-14, D-15.
// Stratégie A : récursif · portée obtenue en REMONTANT les parents · ordre de déclaration.
const REPO = "/Users/yia/Documents/woorri/";
const ts = (await import(REPO + "node_modules/typescript/lib/typescript.js")).default;
const { readFileSync } = await import("node:fs");
export const CORPUS = { execution: ["packages/blocks/src/registry.ts"],
  declarative: ["packages/compiler/runtime/data-provider.tsx"],
  value: [["designTokensSchema","packages/design-tokens/src/schema.ts"],
          ["projectLockSchema","packages/air-schema/src/lock.ts"],
          ["deploymentStateSchema","packages/air-schema/src/deployment-state.ts"]] };
const parse = (f) => ts.createSourceFile(f, readFileSync(REPO + f, "utf8"), ts.ScriptTarget.ES2022, true,
  f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const NOMMEE = (p) => (ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p) || ts.isInterfaceDeclaration(p) ||
  ts.isTypeAliasDeclaration(p) || ts.isVariableDeclaration(p) || ts.isMethodDeclaration(p)) && p.name;
function portee(n, sf) { const v = []; for (let p = n.parent; p; p = p.parent) if (NOMMEE(p)) v.unshift(p.name.getText(sf));
  return v.length ? v.join("/") : "«module»"; }
const G = { [ts.SyntaxKind.IfStatement]:"B1", [ts.SyntaxKind.ConditionalExpression]:"B2",
  [ts.SyntaxKind.CaseClause]:"B4", [ts.SyntaxKind.DefaultClause]:"B4", [ts.SyntaxKind.ForStatement]:"B5",
  [ts.SyntaxKind.ForOfStatement]:"B5", [ts.SyntaxKind.ForInStatement]:"B5", [ts.SyntaxKind.WhileStatement]:"B5",
  [ts.SyntaxKind.DoStatement]:"B5", [ts.SyntaxKind.CatchClause]:"B7" };
const OP = { [ts.SyntaxKind.AmpersandAmpersandToken]:"B3&&", [ts.SyntaxKind.BarBarToken]:"B3||",
  [ts.SyntaxKind.QuestionQuestionToken]:"B3??" };
const genre = (n) => G[n.kind] ?? (ts.isBinaryExpression(n) ? OP[n.operatorToken.kind] : undefined)
  ?? (n.questionDotToken !== undefined ? "B6" : undefined)
  ?? (((ts.isParameter(n) || ts.isBindingElement(n)) && n.initializer !== undefined) ? "B8" : undefined);

function execA(f) { const sf = parse(f), c = new Map(), out = [];
  const rec = (n) => { const g = genre(n);
    if (g) { const p = portee(n, sf), k = `${p}::${g}`, i = (c.get(k) ?? 0) + 1; c.set(k, i);
      out.push(`EXEC::${f}::${p}::${g}#${i}`); }
    ts.forEachChild(n, (x) => { rec(x); }); };
  rec(sf); return out; }

const MEMBRE = (m) => ts.isPropertySignature(m) || ts.isMethodSignature(m) || ts.isPropertyAssignment(m) ||
  ts.isMethodDeclaration(m) || ts.isShorthandPropertyAssignment(m);
function declA(f) { const sf = parse(f), anon = new Map(), out = [];
  const rec = (n) => {
    let membres = null, cont = null;
    if (ts.isInterfaceDeclaration(n)) { membres = n.members; cont = n; }
    else if (ts.isTypeLiteralNode(n)) { membres = n.members; cont = ts.isTypeAliasDeclaration(n.parent) ? n.parent : n; }
    else if (ts.isObjectLiteralExpression(n) && ts.isVariableDeclaration(n.parent)) { membres = n.properties; cont = n; }
    if (membres) {
      let a;
      if (ts.isInterfaceDeclaration(cont) || ts.isTypeAliasDeclaration(cont)) a = cont.name.getText(sf);
      else if (ts.isObjectLiteralExpression(cont) && ts.isVariableDeclaration(cont.parent)) a = cont.parent.name.getText(sf);
      else { const p = portee(cont, sf), i = (anon.get(p) ?? 0) + 1; anon.set(p, i); a = `${p}/{}#${i}`; }
      for (const m of membres) if (MEMBRE(m)) out.push(`DECL::${f}::${a}::${m.name.getText(sf)}`);
    }
    ts.forEachChild(n, (x) => { rec(x); }); };
  rec(sf); return out; }

const D = (x) => x?._zod?.def ?? x?.def; const CK = (c) => c?._zod?.def ?? c?.def ?? c;
function valA(r, s0) { const out = [];
  const rec = (s, p, vus) => { const d = D(s); if (!d || vus.has(s)) return; const v2 = new Set(vus); v2.add(s);
    for (const c of d.checks ?? []) { const x = CK(c);
      out.push(`VAL::${r}::${p}::CHECK:${x.check}::${String(x.pattern ?? x.value ?? x.minimum ?? x.maximum ?? "")}`); }
    const t = d.type;
    if (t === "object") { out.push(`VAL::${r}::${p}::STRICTNESS::${d.catchall === undefined ? "ouvert" : "strict"}`);
      for (const [k, v] of Object.entries(d.shape ?? {})) rec(v, p ? `${p}.${k}` : k, v2); }
    else if (t === "array") rec(d.element, `${p}[]`, v2);
    else if (t === "optional") rec(d.innerType, p, v2);
    else if (t === "nullable") { out.push(`VAL::${r}::${p}::NULLABLE::`); rec(d.innerType, p, v2); }
    else if (t === "default") { out.push(`VAL::${r}::${p}::DEFAULT::${String(d.defaultValue)}`); rec(d.innerType, p, v2); }
    else if (t === "union" || t === "discriminatedUnion") (d.options ?? []).forEach((o, i) => rec(o, `${p}|${i}`, v2));
    else if (t === "enum") out.push(`VAL::${r}::${p}::ENUM::${Object.values(d.entries ?? {}).join(",")}`);
    else if (t === "literal") out.push(`VAL::${r}::${p}::LITERAL::${String((d.values ?? [])[0])}`); };
  rec(s0, "", new Set()); return out; }

const R = { execution: [], declarative: [], value: [] };
for (const f of CORPUS.execution) R.execution.push(...execA(f));
for (const f of CORPUS.declarative) R.declarative.push(...declA(f));
for (const [e, f] of CORPUS.value) { const m = await import(REPO + f); R.value.push(...valA(e, m[e])); }
console.log(JSON.stringify(R));
