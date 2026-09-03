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
  [prop: string]: unknown;
}

export function FlatList<ItemT>({
  data,
  renderItem,
  keyExtractor,
  ...rest
}: FlatListStubProps<ItemT>): ReactElement {
  return createElement(
    "FlatList",
    rest,
    (data ?? []).map((item, index) =>
      createElement(
        Fragment,
        { key: keyExtractor?.(item, index) ?? String(index) },
        renderItem({ item, index }),
      ),
    ),
  );
}
