// ÉTAPE 5 · EXÉCUTANT B — application de R-GRAN-2 (D-1 → D-12).
// Écrit depuis le TEXTE de la règle. Choix de lecture propres à B :
//  · parcours ITÉRATIF par file (BFS), jamais récursif ;
//  · clés d'objet en ORDRE ALPHABÉTIQUE, racines en ORDRE INVERSE du corpus ;
//  · espace DECLARATIVE lu comme « membre nommé d'un CONTRAT DÉCLARÉ » :
//    interfaces, alias de type et littéraux affectés à une const nommée —
//    méthodes INCLUSES (une méthode est un membre nommé du contrat),
//    littéraux de type ANONYMES exclus (pas un contrat déclaré).
// Lecture seule. Sortie : JSON d'identités d'unités sur stdout.
const REPO = "/Users/yia/Documents/woorri/";
const ts = (await import(REPO + "node_modules/typescript/lib/typescript.js")).default;
const { readFileSync } = await import("node:fs");
const CORPUS = {
  execution:   ["packages/blocks/src/registry.ts"],
  declarative: ["packages/compiler/runtime/data-provider.tsx"],
  value:       [["designTokensSchema","packages/design-tokens/src/schema.ts"],
                ["projectLockSchema","packages/air-schema/src/lock.ts"],
                ["deploymentStateSchema","packages/air-schema/src/deployment-state.ts"]],
};
const parse = (f) => ts.createSourceFile(f, readFileSync(REPO + f, "utf8"), ts.ScriptTarget.ES2022, true,
  f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const loc = (s, n, f) => { const c = s.getLineAndCharacterOfPosition(n.getStart(s)); return `${f}@${c.line + 1}:${c.character + 1}`; };

// ── EXECUTION : les 9 genres. Parcours par PILE explicite.
const BRANCHE = (n) => {
  if ([ts.SyntaxKind.IfStatement, ts.SyntaxKind.ConditionalExpression, ts.SyntaxKind.CaseClause,
       ts.SyntaxKind.DefaultClause, ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForOfStatement,
       ts.SyntaxKind.ForInStatement, ts.SyntaxKind.WhileStatement, ts.SyntaxKind.DoStatement,
       ts.SyntaxKind.CatchClause].includes(n.kind)) return true;
  if (ts.isBinaryExpression(n)) return [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken,
                                        ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind);
  if (n.questionDotToken) return true;
  if ((ts.isParameter(n) || ts.isBindingElement(n)) && n.initializer) return true;
  return false;
};
function execB(f) {
  const s = parse(f), out = [], pile = [s];
  while (pile.length) {
    const n = pile.pop();
    if (n !== s && BRANCHE(n)) out.push(loc(s, n, f));
    const enfants = []; ts.forEachChild(n, (c) => { enfants.push(c); });
    for (let i = enfants.length - 1; i >= 0; i--) pile.push(enfants[i]);
  }
  return out;
}

// ── DECLARATIVE : membres nommés d'un contrat DÉCLARÉ (lecture de B)
function declB(f) {
  const s = parse(f), out = [];
  const membres = (noeud) => {
    for (const m of noeud.members ?? noeud.properties ?? []) {
      if (ts.isPropertySignature(m) || ts.isMethodSignature(m) ||
          ts.isPropertyAssignment(m) || ts.isMethodDeclaration(m) || ts.isShorthandPropertyAssignment(m))
        out.push(loc(s, m, f));
    }
  };
  const visite = (n) => {
    if (ts.isInterfaceDeclaration(n)) membres(n);
    else if (ts.isTypeAliasDeclaration(n) && ts.isTypeLiteralNode(n.type)) membres(n.type);
    else if (ts.isVariableDeclaration(n) && n.initializer && ts.isObjectLiteralExpression(n.initializer)) membres(n.initializer);
    ts.forEachChild(n, visite);
  };
  visite(s); return out;
}

// ── VALUE-CONSTRAINT : (racine, chemin, contrainte). BFS, clés triées. D-12 appliquée.
const def = (x) => x?._zod?.def ?? x?.def;
const cdef = (c) => c?._zod?.def ?? c?.def ?? c;
function valB(racine, schema) {
  const out = [], file = [{ s: schema, p: "", vus: new Set() }];
  while (file.length) {
    const { s, p, vus } = file.shift();
    const d = def(s); if (!d || vus.has(s)) continue;
    const vus2 = new Set(vus); vus2.add(s);
    for (const c of d.checks ?? []) { const x = cdef(c);
      out.push(`${racine}|${p}|CHECK:${x.check}|${String(x.pattern ?? x.value ?? x.minimum ?? x.maximum ?? "")}`); }
    const t = d.type;
    if (t === "object") {
      out.push(`${racine}|${p}|STRICTNESS|${d.catchall === undefined ? "ouvert" : "strict"}`);
      for (const k of Object.keys(d.shape ?? {}).sort())
        file.push({ s: d.shape[k], p: p ? `${p}.${k}` : k, vus: vus2 });
    } else if (t === "array") file.push({ s: d.element, p: `${p}[]`, vus: vus2 });
    else if (t === "optional") file.push({ s: d.innerType, p, vus: vus2 });          // D-12
    else if (t === "nullable") { out.push(`${racine}|${p}|NULLABLE|`); file.push({ s: d.innerType, p, vus: vus2 }); }
    else if (t === "default") { out.push(`${racine}|${p}|DEFAULT|${String(d.defaultValue)}`); file.push({ s: d.innerType, p, vus: vus2 }); }
    else if (t === "union" || t === "discriminatedUnion")
      (d.options ?? []).forEach((o, i) => file.push({ s: o, p: `${p}|${i}`, vus: vus2 }));
    else if (t === "enum") out.push(`${racine}|${p}|ENUM|${Object.values(d.entries ?? {}).join(",")}`);
    else if (t === "literal") out.push(`${racine}|${p}|LITERAL|${String((d.values ?? [])[0])}`);
  }
  return out;
}

const R = { execution: [], declarative: [], value: [] };
for (const f of [...CORPUS.execution].reverse()) R.execution.push(...execB(f));
for (const f of [...CORPUS.declarative].reverse()) R.declarative.push(...declB(f));
for (const [exp, file] of [...CORPUS.value].reverse()) { const m = await import(REPO + file); R.value.push(...valB(exp, m[exp])); }
console.log(JSON.stringify(R));
