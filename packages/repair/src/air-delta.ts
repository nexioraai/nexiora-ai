// DELTA D'AIR — instrument du POLICY GATE (Phase 9).
//
// Pourquoi cet instrument existe : comparer les FICHIERS produits avant et
// après une réparation ne discrimine rien quand la réparation porte sur
// l'AIR — le compilateur étant déterministe, changer un nœud d'AIR change
// légitimement tout artefact qui en dérive. Le garde utile n'est donc pas
// « quels fichiers ont changé », mais « QUELS NŒUDS D'AIR ont changé, et
// sont-ils ceux que le diagnostic a désignés ? ».
//
// C'est la traduction exacte du non-négociable #8 : « jamais erreur → LLM →
// modification arbitraire ». Un auteur qui, sous prétexte de réparer un
// bouton, ajouterait une capability, élargirait une permission ou
// supprimerait un écran, sort du périmètre diagnostiqué — et le gate le
// refuse AVANT toute adoption.

export type JsonPath = readonly string[];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Chemins JSON dont la valeur diffère entre deux documents. Parcours
 * déterministe (clés triées), y compris pour les ajouts et suppressions.
 */
export function changedJsonPaths(before: unknown, after: unknown, prefix: JsonPath = []): readonly JsonPath[] {
  if (Object.is(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const out: JsonPath[] = [];
    const max = Math.max(before.length, after.length);
    for (let i = 0; i < max; i += 1) {
      out.push(...changedJsonPaths(before[i], after[i], [...prefix, String(i)]));
    }
    return out;
  }
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const out: JsonPath[] = [];
    for (const key of keys) {
      out.push(...changedJsonPaths(before[key], after[key], [...prefix, key]));
    }
    return out;
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [prefix];
}

/** Rendu lisible d'un chemin — utilisé dans les journaux et les refus. */
export const formatPath = (path: JsonPath): string => path.join(".");

/**
 * Le chemin traverse-t-il le bloc `blockId` ? Résolu en NAVIGUANT le
 * document, jamais par comparaison de chaînes : un identifiant de bloc peut
 * apparaître ailleurs, seule la position réelle fait foi.
 */
export function pathCrossesBlock(air: unknown, path: JsonPath, blockId: string): boolean {
  let node: unknown = air;
  for (let i = 0; i < path.length; i += 1) {
    const key = path[i] ?? "";
    const next: unknown = Array.isArray(node)
      ? (node as readonly unknown[])[Number(key)]
      : isObject(node)
        ? node[key]
        : undefined;
    if (isObject(next) && next.id === blockId && path[i - 1] === "blocks") return true;
    node = next;
  }
  return false;
}

/** Le chemin porte-t-il sur la déclaration/liste de slots ? */
export const pathIsSlots = (path: JsonPath): boolean => path[0] === "slots";
