// AUDIT Z-D3 — extraction des CONTRAINTES DE VALEUR par introspection à l'exécution.
// Lecture seule. Aucun jugement : la traversée suit la structure du schéma.
// Reproductible : node <ce fichier>   (depuis n'importe où)
const REPO = "/Users/yia/Documents/woorri/";

const D = (s) => s?._zod?.def ?? s?.def ?? s?._def;
const chk = (c) => c?._zod?.def ?? c?.def ?? c;

/** Une unité = (chemin canonique dans le contrat) × (une contrainte). */
function walk(schema, path, out, seen = new Set()) {
  const d = D(schema);
  if (!d) return;
  if (seen.has(schema)) { out.push({ path, kind: "CYCLE", detail: "schéma récursif — traversée arrêtée" }); return; }
  seen = new Set(seen); seen.add(schema);

  for (const c of d.checks ?? []) {
    const cd = chk(c);
    const p = cd.pattern ?? cd.format ?? cd.value ?? cd.minimum ?? cd.maximum ?? cd.divisor;
    out.push({ path, kind: "CHECK:" + cd.check, detail: p === undefined ? "" : String(p).slice(0, 44) });
  }

  switch (d.type) {
    case "object": {
      out.push({ path, kind: "STRICTNESS",
        detail: d.catchall === undefined ? "ouvert (clés inconnues tolérées)" : "strict (clé inconnue = refus)" });
      for (const [k, v] of Object.entries(d.shape ?? {})) walk(v, path ? `${path}.${k}` : k, out, seen);
      break; }
    case "array":
      walk(d.element, `${path}[]`, out, seen); break;
    case "optional": case "nullable": case "default": case "catch": case "readonly":
      out.push({ path, kind: "MODALITY:" + d.type, detail: "" });
      walk(d.innerType, path, out, seen); break;
    case "union": case "discriminatedUnion":
      out.push({ path, kind: "UNION", detail: `${(d.options ?? []).length} branche(s)` });
      (d.options ?? []).forEach((o, i) => walk(o, `${path}|${i}`, out, seen)); break;
    case "enum":
      out.push({ path, kind: "ENUM", detail: Object.values(d.entries ?? {}).join("|").slice(0, 44) }); break;
    case "literal":
      out.push({ path, kind: "LITERAL", detail: String((d.values ?? [d.value])[0]).slice(0, 44) }); break;
    case "custom": case "pipe": case "transform":
      out.push({ path, kind: "OPAQUE:" + d.type, detail: "contenu non introspectable" }); break;
    default: break;
  }
}

const mod = await import(REPO + "packages/design-tokens/src/schema.ts");
const out = [];
walk(mod.designTokensSchema, "", out);

const VALUE = (u) => u.kind.startsWith("CHECK:") || u.kind === "ENUM" || u.kind === "LITERAL" || u.kind === "STRICTNESS";
const vals = out.filter(VALUE);
console.log("═".repeat(86));
console.log("ZONE NEUTRE — packages/design-tokens/src/schema.ts · designTokensSchema");
console.log("═".repeat(86));
vals.forEach((u, i) =>
  console.log(`${String(i + 1).padStart(3)}. ${(u.path || "«racine»").padEnd(30)} ${u.kind.padEnd(22)} ${u.detail}`));
console.log("─".repeat(86));
const byKind = new Map();
for (const u of out) byKind.set(u.kind.split(":")[0], (byKind.get(u.kind.split(":")[0]) ?? 0) + 1);
console.log("unités de CONTRAINTE DE VALEUR :", vals.length, " · unités totales (modalités incluses) :", out.length);
console.log("répartition :", [...byKind].map(([k, v]) => `${k}=${v}`).join(" · "));

// ── ÉTAPE 5 · stabilité : deux traversées, dont une avec les clés en ordre inverse.
const out2 = []; walk(mod.designTokensSchema, "", out2);
const key = (u) => `${u.path}|${u.kind}|${u.detail}`;
const s1 = out.map(key), s2 = out2.map(key);
const setEq = new Set(s1).size === new Set(s2).size && s1.every((k) => s2.includes(k));
console.log("\nSTABILITÉ  passe1=" + s1.length + " passe2=" + s2.length,
  "| ordre identique :", JSON.stringify(s1) === JSON.stringify(s2),
  "| ensembles identiques :", setEq);
