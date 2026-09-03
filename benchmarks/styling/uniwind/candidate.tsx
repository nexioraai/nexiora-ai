// CANDIDAT « uniwind » (v1, moteur LIBRE — le moteur C++ « Pro » est payant
// et N'EST PAS bancé) — mêmes contrats partagés, styles via className
// Tailwind v4. Les thèmes sont des variables CSS (@variant light/dark
// générées depuis la source de tokens unique) : les classes sont donc
// sémantiques et identiques dans les deux schémas.
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Uniwind, useUniwind } from "uniwind";
import type { Primitives, ThemeBridge } from "../fixture-core/contracts";

declare module "uniwind" {
  export interface UniwindConfig {
    themes: readonly ["light", "dark"];
  }
}

export function useThemeBridge(): ThemeBridge {
  const { theme } = useUniwind();
  return {
    scheme: theme === "dark" ? "dark" : "light",
    setScheme: (s) => Uniwind.setTheme(s),
  };
}

export const primitives: Primitives = {
  ScreenShell: ({ title, children }) => (
    <View className="flex-1 bg-bg">
      <Text className="text-heading font-bold text-text p-lg">{title}</Text>
      {children}
    </View>
  ),
  Card: ({ item }) => (
    <View className="bg-surface border border-border rounded-md p-md mx-lg my-xs flex-row items-center">
      <View className="flex-1">
        <Text className="text-body font-semibold text-text">{item.title}</Text>
        <Text className="text-label text-muted mt-0.5">{item.subtitle}</Text>
        <View className="bg-badge-bg rounded-sm px-sm py-0.5 self-start mt-xs">
          <Text className="text-label text-muted">{item.badge}</Text>
        </View>
      </View>
      <Text className="text-body font-bold text-primary ms-md">{item.amount}</Text>
    </View>
  ),
  TextField: ({ label, value, onChangeText, placeholder, error, loading }) => (
    <View className="mb-md">
      <Text className="text-label text-muted mb-xs">{label}</Text>
      <View className="flex-row items-center">
        <TextInput
          className={`flex-1 border rounded-sm px-md py-sm text-body bg-surface text-text ${
            error !== undefined ? "border-error" : "border-border"
          }`}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
        />
        {loading === true && <ActivityIndicator className="ms-2" />}
      </View>
      {error !== undefined && <Text className="text-label text-error mt-0.5">{error}</Text>}
    </View>
  ),
  AppButton: ({ label, onPress, kind, testID }) => (
    <Pressable
      className={`rounded-md py-md items-center my-sm ${
        kind === "ghost" ? "bg-transparent border border-primary" : "bg-primary"
      }`}
      onPress={onPress}
      testID={testID}
    >
      <Text className={`font-semibold text-body ${kind === "ghost" ? "text-primary" : "text-on-primary"}`}>
        {label}
      </Text>
    </Pressable>
  ),
  Badge: ({ label, tone }) => (
    <View className="bg-badge-bg rounded-sm px-sm py-0.5 self-start mt-xs">
      <Text
        className={`text-label ${
          tone === "success" ? "text-success" : tone === "warn" ? "text-warn" : "text-muted"
        }`}
      >
        {label}
      </Text>
    </View>
  ),
  Section: ({ title, children }) => (
    <ScrollView contentContainerClassName="p-lg">
      <Text className="text-title font-semibold text-text mb-md">{title}</Text>
      {children}
    </ScrollView>
  ),
};
