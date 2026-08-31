// ÉTAPE 5 · EXÉCUTANT A — application de R-GRAN-2 (D-1 → D-12).
// Stratégie A : parcours RÉCURSIF (DFS), clés dans l'ORDRE DE DÉCLARATION,
// racines dans l'ordre du corpus. Espace DECLARATIVE lu par la SYNTAXE.
// Lecture seule. Sortie : JSON d'identités d'unités sur stdout.
const REPO = "/Users/yia/Documents/woorri/";
const ts = (await import(REPO + "node_modules/typescript/lib/typescript.js")).default;
const { readFileSync } = await import("node:fs");
export const CORPUS = {
  execution:   ["packages/blocks/src/registry.ts"],
  declarative: ["packages/compiler/runtime/data-provider.tsx"],
  value:       [["designTokensSchema","packages/design-tokens/src/schema.ts"],
                ["projectLockSchema","packages/air-schema/src/lock.ts"],
                ["deploymentStateSchema","packages/air-schema/src/deployment-state.ts"]],
};
const sf = (f) => ts.createSourceFile(f, readFileSync(REPO + f, "utf8"), ts.ScriptTarget.ES2022, true,
  f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

// ── ESPACE EXECUTION — liste close de 9 genres (D-1)
const K = new Set([ts.SyntaxKind.IfStatement, ts.SyntaxKind.ConditionalExpression, ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.DefaultClause, ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.ForInStatement, ts.SyntaxKind.WhileStatement, ts.SyntaxKind.DoStatement, ts.SyntaxKind.CatchClause]);
const LOG = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]);
function execUnits(f) {
  const s = sf(f), out = [];
  const visit = (n) => {
    const pos = n.getStart(s), lc = s.getLineAndCharacterOfPosition(pos);
    const id = `${f}@${lc.line + 1}:${lc.character + 1}`;
    if (K.has(n.kind)) out.push(id);
    else if (ts.isBinaryExpression(n) && LOG.has(n.operatorToken.kind)) out.push(id);
    else if (n.questionDotToken !== undefined) out.push(id);
    else if ((ts.isParameter(n) || ts.isBindingElement(n)) && n.initializer !== undefined) out.push(id);
    ts.forEachChild(n, visit);
  };
  visit(s); return out;
}

// ── ESPACE DECLARATIVE — lecture SYNTAXIQUE (PropertySignature | PropertyAssignment)
function declUnits(f) {
  const s = sf(f), out = [];
  const visit = (n) => {
    if (ts.isPropertySignature(n) || ts.isPropertyAssignment(n)) {
      const lc = s.getLineAndCharacterOfPosition(n.getStart(s));
      out.push(`${f}@${lc.line + 1}:${lc.character + 1}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(s); return out;
}

// ── ESPACE VALUE-CONSTRAINT — introspection à l'exécution, D-6 (racine,chemin), D-12
const D = (x) => x?._zod?.def ?? x?.def;
const ck = (c) => c?._zod?.def ?? c?.def ?? c;
function valUnits(root, schema) {
  const out = [];
  const rec = (s, p, seen) => {
    const d = D(s); if (!d || seen.has(s)) return; const s2 = new Set(seen); s2.add(s);
    for (const c of d.checks ?? []) { const cd = ck(c);
      out.push(`${root}|${p}|CHECK:${cd.check}|${String(cd.pattern ?? cd.value ?? cd.minimum ?? cd.maximum ?? "")}`); }
    switch (d.type) {
      case "object":
        out.push(`${root}|${p}|STRICTNESS|${d.catchall === undefined ? "ouvert" : "strict"}`);
        for (const [k, v] of Object.entries(d.shape ?? {})) rec(v, p ? `${p}.${k}` : k, s2); break;
      case "array": rec(d.element, `${p}[]`, s2); break;
      case "optional": rec(d.innerType, p, s2); break;                       // D-12 : DECLARATIVE, pas ici
      case "nullable": out.push(`${root}|${p}|NULLABLE|`); rec(d.innerType, p, s2); break;
      case "default":  out.push(`${root}|${p}|DEFAULT|${String(d.defaultValue)}`); rec(d.innerType, p, s2); break;
      case "union": case "discriminatedUnion":
        (d.options ?? []).forEach((o, i) => rec(o, `${p}|${i}`, s2)); break;
      case "enum": out.push(`${root}|${p}|ENUM|${Object.values(d.entries ?? {}).join(",")}`); break;
      case "literal": out.push(`${root}|${p}|LITERAL|${String((d.values ?? [])[0])}`); break;
    }
  };
  rec(schema, "", new Set()); return out;
}

const R = { execution: [], declarative: [], value: [] };
for (const f of CORPUS.execution) R.execution.push(...execUnits(f));
for (const f of CORPUS.declarative) R.declarative.push(...declUnits(f));
for (const [exp, file] of CORPUS.value) { const m = await import(REPO + file); R.value.push(...valUnits(exp, m[exp])); }
console.log(JSON.stringify(R));
