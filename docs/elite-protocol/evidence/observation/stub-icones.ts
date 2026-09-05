// STUB D'HÔTE — `@expo/vector-icons` (1.8.0, phase 3 de la refonte UX).
//
// Le paquet réel expose du JSX dans des fichiers `.js` construits, que le
// bundler du harnais refuse de parser : « Unexpected JSX expression » sur
// `createIconSet.js`. Le même motif que les trois stubs voisins — ce qui rend
// l'exécution OBSERVABLE en node, c'est de remplacer l'hôte, pas de renoncer.
//
// Le stub REND quelque chose : un élément portant le nom du glyphe demandé.
// Une observation peut donc vérifier qu'une icône est bien demandée, et
// LAQUELLE — un stub qui rendrait `null` ferait taire la question.
import { createElement } from "react";

export interface IconeProps {
  name: string;
  size?: number;
  color?: string;
  testID?: string;
}

export default function Ionicons({ name, size, color, testID }: IconeProps) {
  return createElement("Icone", { name, size, color, testID: testID ?? `icone-${name}` });
}
