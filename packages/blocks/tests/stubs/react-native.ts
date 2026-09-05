// STUB react-native pour tests structurels (E1) — même approche que
// @deribfy/primitives (composants hôtes purs), plus une FlatList
// FONCTIONNELLE : react-test-renderer n'appelle jamais renderItem d'un
// composant hôte, le stub matérialise donc les lignes.
import { createElement, Fragment } from "react";
import type { ReactElement } from "react";

export const View = "View";
export const Text = "Text";
export const TextInput = "TextInput";
export const Pressable = "Pressable";
export const ActivityIndicator = "ActivityIndicator";
export const StyleSheet = {
  create: <T,>(styles: T): T => styles,
};

interface FlatListStubProps<ItemT> {
  data?: readonly ItemT[];
  renderItem: (info: { item: ItemT; index: number }) => ReactElement;
  keyExtractor?: (item: ItemT, index: number) => string;
  ListHeaderComponent?: ReactElement | (() => ReactElement) | null;
  ListEmptyComponent?: ReactElement | (() => ReactElement) | null;
  [prop: string]: unknown;
}

const materialiser = (
  c: ReactElement | (() => ReactElement) | null | undefined,
): ReactElement | null =>
  c == null ? null : typeof c === "function" ? createElement(c) : c;

export function FlatList<ItemT>({
  data,
  renderItem,
  keyExtractor,
  ListHeaderComponent,
  ListEmptyComponent,
  ...rest
}: FlatListStubProps<ItemT>): ReactElement {
  // DET-033 : le stub matérialise aussi l'en-tête et l'état vide — la vraie
  // FlatList les rend, un stub qui les tairait rendrait ces régions
  // inobservables (c'est exactement ainsi qu'un défaut réel se cacherait).
  const lignes = (data ?? []).map((item, index) =>
    createElement(
      Fragment,
      { key: keyExtractor?.(item, index) ?? String(index) },
      renderItem({ item, index }),
    ),
  );
  return createElement(
    "FlatList",
    rest,
    materialiser(ListHeaderComponent),
    lignes.length === 0 ? materialiser(ListEmptyComponent) : lignes,
  );
}
