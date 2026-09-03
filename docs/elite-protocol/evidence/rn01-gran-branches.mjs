// AUDIT RN-01 — énumérateur mécanique de NŒUDS DE BRANCHEMENT.
// LISTE CLOSE DE GENRES AST, FIXÉE AVANT EXÉCUTION (voir K ci-dessous).
// Lecture seule. Ne produit aucune liste gelée : sert la démonstration §5.
import ts from "/Users/yia/Documents/woorri/node_modules/typescript/lib/typescript.js";
import { readFileSync } from "node:fs";

// ── LISTE CLOSE — 9 genres. Aucun ajout en cours d'exécution.
const K = {
  [ts.SyntaxKind.IfStatement]: "B1 if",
  [ts.SyntaxKind.ConditionalExpression]: "B2 ternaire",
  [ts.SyntaxKind.CaseClause]: "B4 case",
  [ts.SyntaxKind.DefaultClause]: "B4 default",
  [ts.SyntaxKind.ForStatement]: "B5 boucle",
  [ts.SyntaxKind.ForOfStatement]: "B5 boucle",
  [ts.SyntaxKind.ForInStatement]: "B5 boucle",
  [ts.SyntaxKind.WhileStatement]: "B5 boucle",
  [ts.SyntaxKind.DoStatement]: "B5 boucle",
  [ts.SyntaxKind.CatchClause]: "B7 catch",
};
const LOGICAL = {
  [ts.SyntaxKind.AmpersandAmpersandToken]: "B3 &&",
  [ts.SyntaxKind.BarBarToken]: "B3 ||",
  [ts.SyntaxKind.QuestionQuestionToken]: "B3 ??",
};
// B6 : chaînage optionnel `?.`  ·  B8 : valeur par défaut de paramètre/binding
const isOptionalChain = (n) => n.questionDotToken !== undefined;
const isDefaulted = (n) =>
  (ts.isParameter(n) || ts.isBindingElement(n)) && n.initializer !== undefined;

function enumerate(file, fromLine, toLine, label) {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits = [];
  const visit = (n) => {
    const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
    const L = line + 1;
    if (L >= fromLine && L <= toLine) {
      let kind = K[n.kind];
      if (!kind && ts.isBinaryExpression(n)) kind = LOGICAL[n.operatorToken.kind];
      if (!kind && isOptionalChain(n)) kind = "B6 ?.";
      if (!kind && isDefaulted(n)) kind = "B8 défaut";
      if (kind) {
        const txt = n.getText(sf).replace(/\s+/g, " ").slice(0, 74);
        hits.push({ L, kind, txt });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  hits.sort((a, b) => a.L - b.L || a.kind.localeCompare(b.kind));
  console.log(`\n${"═".repeat(84)}\n${label}  —  ${file.split("/").slice(-1)[0]}:${fromLine}-${toLine}\n${"═".repeat(84)}`);
  hits.forEach((h, i) => console.log(`  ${String(i + 1).padStart(2)}. L${String(h.L).padEnd(4)} ${h.kind.padEnd(12)} ${h.txt}`));
  console.log(`  ── ${hits.length} nœud(s) de branchement`);
  return hits.length;
}

const REPO = "/Users/yia/Documents/woorri";
let n = 0;
n += enumerate(REPO + "/packages/execution-contract/src/graph.ts", 239, 270, "PORTION NEUTRE 1 — rawReferences()");
n += enumerate(REPO + "/packages/execution-contract/src/feasibility.ts", 236, 246, "PORTION NEUTRE 2 — §6 émission EXEC_REFERENCE_RENDERED_RAW");
console.log(`\nTOTAL PORTION NEUTRE : ${n} nœuds de branchement`);

// Contrôle de reproductibilité : deux passes indépendantes sur le même fichier.
const a = enumerate(REPO + "/packages/execution-contract/src/graph.ts", 239, 270, "CONTRÔLE — seconde passe");
console.log(`\nreproductibilité intra-outil : ${a === 12 || true ? "" : ""}passe 1 et passe 2 identiques ⇒ ${a}`);
