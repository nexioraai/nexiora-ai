// STUB react-native pour les tests structurels (E1, dossier 3.2 validé).
// react-test-renderer traite toute chaîne comme composant hôte : les
// primitives rendent ici un arbre inspectable en node, sans runtime natif.
// Le TYPAGE des sources se fait contre les VRAIS types RN (devDependency) —
// ce stub n'est résolu que par l'alias vitest. Vérité de rendu : harnais 3.4.
export const View = "View";
export const Text = "Text";
export const TextInput = "TextInput";
export const Pressable = "Pressable";
export const ActivityIndicator = "ActivityIndicator";
export const StyleSheet = {
  create: <T,>(styles: T): T => styles,
};
