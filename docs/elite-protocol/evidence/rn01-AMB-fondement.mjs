// AMB-1 / AMB-2 — épreuve du principe D-6 : le décompte doit-il dépendre du STYLE D'ÉCRITURE ?
// Lecture seule, fichiers de sonde créés puis supprimés. node <ce fichier>
const REPO = "/Users/yia/Documents/woorri/";
const ts = (await import(REPO + "node_modules/typescript/lib/typescript.js")).default;
const { writeFileSync, rmSync } = await import("node:fs");

const OPT = { strict: true, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext };

function membresDuType(code, nom) {
  const f = REPO + "packages/air-schema/src/__amb_probe.ts";
  writeFileSync(f, code);
  try {
    const prog = ts.createProgram([f], OPT); const ck = prog.getTypeChecker();
    const sf = prog.getSourceFile(f);
    let d = null;
    ts.forEachChild(sf, (n) => { if ((ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) && n.name.text === nom) d = n; });
    const t = ck.getTypeAtLocation(d.name);
    return ck.getPropertiesOfType(t).map((p) => `${p.name}: ${ck.typeToString(ck.getTypeOfSymbolAtLocation(p, d))}`).sort();
  } finally { rmSync(f, { force: true }); }
}

console.log("═".repeat(80));
console.log("AMB-1 · méthode  vs  propriété de type fonction — MÊME MEMBRE ?");
console.log("═".repeat(80));
const ecritureMethode = `export interface C {
  lister(id: string): readonly string[];
  obtenir(id: string): string | undefined;
}`;
const ecriturePropriete = `export interface C {
  lister: (id: string) => readonly string[];
  obtenir: (id: string) => string | undefined;
}`;
const m1 = membresDuType(ecritureMethode, "C"), m2 = membresDuType(ecriturePropriete, "C");
console.log("  écriture MÉTHODE   →", m1.join("  ·  "));
console.log("  écriture PROPRIÉTÉ →", m2.join("  ·  "));
console.log("  membres identiques :", JSON.stringify(m1) === JSON.stringify(m2) ? "🟢 OUI" : "🔴 non");
console.log("  ⇒ exclure MethodSignature ferait dépendre le décompte du STYLE D'ÉCRITURE");

console.log("\n" + "═".repeat(80));
console.log("AMB-2 · littéral anonyme  vs  interface extraite — MÊME CONTRAT ?");
console.log("═".repeat(80));
const anonyme = `type Enveloppe<T> = T & { enfants: string };
export type P = Enveloppe<{ fournisseur: string }>;`;
const nomme = `type Enveloppe<T> = T & { enfants: string };
interface Props { fournisseur: string }
export type P = Enveloppe<Props>;`;
const a1 = membresDuType(anonyme, "P"), a2 = membresDuType(nomme, "P");
console.log("  littéral ANONYME →", a1.join("  ·  "));
console.log("  interface NOMMÉE →", a2.join("  ·  "));
console.log("  membres identiques :", JSON.stringify(a1) === JSON.stringify(a2) ? "🟢 OUI" : "🔴 non");
console.log("  ⇒ exclure les littéraux anonymes ferait dépendre le décompte de l'EXTRACTION d'une interface");
