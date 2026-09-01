// ÉCHELLE DE DÉGRADATION DU SCHÉMA DE SORTIE — module PUR, sans effet de bord.
//
// Extrait de `emit-v3.mjs` pour être TESTABLE. Le harnais exécute sa campagne au
// chargement : tant que ces fonctions y vivaient, seul un cliquet sur le texte
// du source pouvait les vérifier — jamais leur COMPORTEMENT.
//
// Aucun accès réseau, fichier, horloge ni aléa : ce module transforme un schéma
// JSON en une échelle de repli, rien d'autre.

export function stripKeys(node, keys) {
  if (Array.isArray(node)) return node.map((n) => stripKeys(n, keys));
  if (node !== null && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (keys.includes(k)) continue;
      out[k] = stripKeys(v, keys);
    }
    return out;
  }
  return node;
}

export function oneOfToAnyOf(node) {
  if (Array.isArray(node)) return node.map(oneOfToAnyOf);
  if (node !== null && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k === "oneOf" ? "anyOf" : k] = oneOfToAnyOf(v);
    return out;
  }
  return node;
}

export function clampMinItems(node) {
  if (Array.isArray(node)) return node.map(clampMinItems);
  if (node !== null && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = k === "minItems" && typeof v === "number" && v > 1 ? 1 : clampMinItems(v);
    }
    return out;
  }
  return node;
}

export function makeLevels(jsonSchema) {
  const base = oneOfToAnyOf(jsonSchema);
  const L1 = stripKeys(base, ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]);
  // PREMIER NIVEAU : la seule incompatibilité connue est neutralisée par une
  // correction CIBLÉE, et les bornes hautes survivent.
  const L0 = clampMinItems(L1);
  const L2 = stripKeys(L1, ["minLength", "maxLength", "minItems", "maxItems"]);
  const L3 = stripKeys(L2, ["pattern", "format"]);
  return [
    { name: "minItems-ramene", schema: L0 },
    { name: "sans-bornes-numeriques", schema: L1 },
    { name: "sans-longueurs", schema: L2 },
    { name: "sans-patterns", schema: L3 },
  ];
}
