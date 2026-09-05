// STUB D'HÔTES RN — étend celui du dépôt sans le modifier.
// Le stub de `packages/blocks/tests/stubs` ne couvre que les hôtes utilisés par
// les blocs ; les écrans ÉMIS en utilisent d'autres (ScrollView).
export * from "../../../../packages/blocks/tests/stubs/react-native";
export const ScrollView = "ScrollView";
// DET-030 — les écrans sans liste sont désormais enveloppés d'un ancrage
// clavier ; l'hôte doit exister ici aussi, sinon l'élément est `undefined`
// et le rendu observable explose (vu en CI, pas sur l'appareil).
export const KeyboardAvoidingView = "KeyboardAvoidingView";
export const SafeAreaView = "SafeAreaView";
export const Image = "Image";
