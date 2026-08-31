// POLITIQUE AST DES CODE SLOTS (Phase 9 — ARCHITECTURE §4, §27).
//
// « Politique AST » au sens strict : l'analyse porte sur l'ARBRE SYNTAXIQUE
// produit par le compilateur TypeScript, JAMAIS sur une expression régulière.
// Une recherche textuelle est contournable par une chaîne, un commentaire ou
// un accès calculé ; un AST ne l'est pas. Le paquet dépend donc de
// `typescript` — dépendance du MOTEUR, jamais du projet généré.
//
// Fail-closed : toute source non analysable est un ÉCHEC, jamais un succès
// par défaut. Le verdict est machinable (codes stables), jamais un texte.
import ts from "typescript";
import {
  SLOT_ENTRY_NAME,
  type SlotBundle,
  type SlotDeclaration,
  type SlotImplementation,
  type SlotPolicyVerdict,
  type SlotViolation,
} from "./contracts.ts";

// Identifiants globaux REFUSÉS. Trois familles, toutes issues du modèle de
// menace §27 : exfiltration réseau, accès au disque/aux secrets, exécution
// dynamique. Le quatrième groupe (non-déterminisme ambiant) découle de
// l'invariant de conception : un slot est une fonction pure de ses entrées.
const FORBIDDEN_IDENTIFIERS: Readonly<Record<string, string>> = {
  fetch: "SLOT_NETWORK_ACCESS",
  XMLHttpRequest: "SLOT_NETWORK_ACCESS",
  WebSocket: "SLOT_NETWORK_ACCESS",
  EventSource: "SLOT_NETWORK_ACCESS",
  navigator: "SLOT_NETWORK_ACCESS",
  require: "SLOT_REQUIRE",
  process: "SLOT_SECRET_ACCESS",
  globalThis: "SLOT_SECRET_ACCESS",
  global: "SLOT_SECRET_ACCESS",
  localStorage: "SLOT_SECRET_ACCESS",
  sessionStorage: "SLOT_SECRET_ACCESS",
  __dirname: "SLOT_FS_ACCESS",
  __filename: "SLOT_FS_ACCESS",
  eval: "SLOT_DYNAMIC_EVAL",
  Function: "SLOT_DYNAMIC_EVAL",
  Promise: "SLOT_ASYNC_FORBIDDEN",
  setTimeout: "SLOT_ASYNC_FORBIDDEN",
  setInterval: "SLOT_ASYNC_FORBIDDEN",
  queueMicrotask: "SLOT_ASYNC_FORBIDDEN",
  Date: "SLOT_AMBIENT_NONDETERMINISM",
  crypto: "SLOT_AMBIENT_NONDETERMINISM",
  performance: "SLOT_AMBIENT_NONDETERMINISM",
};

// `Math` est licite (arithmétique) SAUF son générateur pseudo-aléatoire.
const FORBIDDEN_MEMBERS: readonly { readonly object: string; readonly member: string }[] = [
  { object: "Math", member: "random" },
];

const lineOf = (sf: ts.SourceFile, node: ts.Node): number =>
  sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

const isExported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

const isDefaultExported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

const isAsync = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

/** Initialiseur admis au niveau module : littéral pur, sans le moindre appel. */
function isPureLiteral(node: ts.Expression): boolean {
  if (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return true;
  }
  if (ts.isPrefixUnaryExpression(node)) return isPureLiteral(node.operand);
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return isPureLiteral(node.expression);
  if (ts.isArrayLiteralExpression(node)) return node.elements.every(isPureLiteral);
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every(
      (p) => ts.isPropertyAssignment(p) && !ts.isComputedPropertyName(p.name) && isPureLiteral(p.initializer),
    );
  }
  return false;
}

/** Un identifiant en position de NOM (propriété, déclaration) n'est pas une référence. */
function isReference(node: ts.Identifier): boolean {
  // `setParentNodes: true` à la création du SourceFile : le parent existe.
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isPropertySignature(parent) && parent.name === node) return false;
  if (ts.isParameter(parent) && parent.name === node) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  if (ts.isFunctionDeclaration(parent) && parent.name === node) return false;
  if (ts.isBindingElement(parent) && parent.name === node) return false;
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent)) return false;
  if (ts.isTypeReferenceNode(parent) || ts.isQualifiedName(parent)) return false;
  return true;
}

/**
 * Analyse une implémentation de slot contre sa DÉCLARATION AIR.
 * Fonction PURE : aucun fs, aucun réseau, aucune horloge.
 */
export function checkSlotImplementation(
  impl: SlotImplementation,
  declaration: SlotDeclaration | undefined,
): readonly SlotViolation[] {
  const violations: SlotViolation[] = [];
  const push = (code: string, line: number, detail: string): void => {
    violations.push({ code, slotId: impl.slotId, line, detail });
  };

  if (declaration === undefined) {
    push("SLOT_UNDECLARED", 0, `slot "${impl.slotId}" absent des slots de l'AIR`);
    return violations;
  }

  // 1. Syntaxe : une source non analysable ne peut pas être déclarée sûre.
  const transpiled = ts.transpileModule(impl.source, {
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  for (const d of transpiled.diagnostics ?? []) {
    if (d.category !== ts.DiagnosticCategory.Error) continue;
    push("SLOT_SYNTAX_ERROR", 0, ts.flattenDiagnosticMessageText(d.messageText, " ").slice(0, 120));
  }
  if (violations.length > 0) return violations;

  const sf = ts.createSourceFile(
    `${impl.slotId}.ts`,
    impl.source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );

  // 2. Statements de niveau module : imports, types, fonctions et constantes
  //    littérales UNIQUEMENT — tout effet au chargement est refusé.
  const allowed = new Set([
    ts.SyntaxKind.ImportDeclaration,
    ts.SyntaxKind.InterfaceDeclaration,
    ts.SyntaxKind.TypeAliasDeclaration,
    ts.SyntaxKind.FunctionDeclaration,
    ts.SyntaxKind.VariableStatement,
    ts.SyntaxKind.EmptyStatement,
  ]);
  let entry: ts.FunctionDeclaration | undefined;
  let exportedCount = 0;
  for (const st of sf.statements) {
    if (!allowed.has(st.kind)) {
      push("SLOT_TOPLEVEL_EFFECT", lineOf(sf, st), `statement de niveau module interdit (${ts.SyntaxKind[st.kind]})`);
      continue;
    }
    if (ts.isVariableStatement(st)) {
      const isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0;
      if (!isConst) {
        push("SLOT_TOPLEVEL_EFFECT", lineOf(sf, st), "déclaration mutable de niveau module");
      }
      for (const d of st.declarationList.declarations) {
        if (d.initializer === undefined || !isPureLiteral(d.initializer)) {
          push("SLOT_TOPLEVEL_EFFECT", lineOf(sf, st), "constante de niveau module non littérale");
        }
      }
      if (isExported(st)) exportedCount += st.declarationList.declarations.length;
    }
    if (ts.isFunctionDeclaration(st) && isExported(st)) {
      exportedCount += 1;
      if (st.name?.text === SLOT_ENTRY_NAME) entry = st;
    }
    // 3. Imports : allowlist AIR, jamais de chemin relatif (atteindre une
    //    copie de bloc ou le runtime est hors du modèle de menace autorisé).
    if (ts.isImportDeclaration(st)) {
      const spec = ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : "";
      if (spec.startsWith(".") || spec.startsWith("/")) {
        push("SLOT_IMPORT_RELATIVE", lineOf(sf, st), `import relatif "${spec}"`);
      } else if (!declaration.allowedImports.includes(spec)) {
        push("SLOT_IMPORT_FORBIDDEN", lineOf(sf, st), `"${spec}" hors allowlist [${declaration.allowedImports.join(", ")}]`);
      }
    }
  }

  // 4. Forme de la sortie : UNE fonction exportée, nommée, synchrone, à un
  //    paramètre (l'objet d'entrées typé par le compilateur).
  if (entry === undefined) {
    push("SLOT_EXPORT_SHAPE", 0, `fonction exportée "${SLOT_ENTRY_NAME}" absente`);
  } else {
    if (exportedCount !== 1) {
      push("SLOT_EXPORT_SHAPE", lineOf(sf, entry), `${String(exportedCount)} exports (1 attendu)`);
    }
    // Le registre de slots émis importe la fonction PAR SON NOM : un export
    // par défaut compilerait ici et casserait à l'import côté projet généré.
    if (isDefaultExported(entry)) {
      push("SLOT_EXPORT_SHAPE", lineOf(sf, entry), "export par défaut (export nommé exigé)");
    }
    if (isAsync(entry)) {
      push("SLOT_ASYNC_FORBIDDEN", lineOf(sf, entry), "fonction asynchrone");
    }
    if (entry.parameters.length !== 1) {
      push("SLOT_EXPORT_SHAPE", lineOf(sf, entry), `${String(entry.parameters.length)} paramètres (1 attendu)`);
    }
  }

  // 5. Parcours COMPLET de l'arbre : identifiants interdits, membres
  //    interdits, import dynamique, await, `new Function`.
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      push("SLOT_DYNAMIC_IMPORT", lineOf(sf, node), "import() dynamique");
    }
    if (ts.isAwaitExpression(node)) {
      push("SLOT_ASYNC_FORBIDDEN", lineOf(sf, node), "await");
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const obj = node.expression.text;
      const member = node.name.text;
      if (FORBIDDEN_MEMBERS.some((f) => f.object === obj && f.member === member)) {
        push("SLOT_AMBIENT_NONDETERMINISM", lineOf(sf, node), `${obj}.${member}`);
      }
    }
    if (ts.isIdentifier(node) && isReference(node)) {
      const code = FORBIDDEN_IDENTIFIERS[node.text];
      if (code !== undefined) push(code, lineOf(sf, node), `référence à "${node.text}"`);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);

  return violations;
}

/**
 * Verdict de politique sur un BUNDLE complet, contre les slots déclarés par
 * l'AIR. Deux implémentations d'un même slot = refus (ambiguïté interdite).
 */
export function checkSlotBundle(
  bundle: SlotBundle,
  declarations: readonly SlotDeclaration[],
): SlotPolicyVerdict {
  const byId = new Map(declarations.map((d) => [d.id, d]));
  const seen = new Set<string>();
  const violations: SlotViolation[] = [];
  for (const impl of bundle) {
    if (seen.has(impl.slotId)) {
      violations.push({
        code: "SLOT_DUPLICATE",
        slotId: impl.slotId,
        line: 0,
        detail: "deux implémentations pour un même slot",
      });
      continue;
    }
    seen.add(impl.slotId);
    violations.push(...checkSlotImplementation(impl, byId.get(impl.slotId)));
  }
  return { passed: violations.length === 0, violations };
}
