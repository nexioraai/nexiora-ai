// CANDIDAT « nativewind » (v4) — mêmes contrats partagés, styles via
// className Tailwind (thème par variantes dark:, tokens depuis tailwind.config
// alimenté par la source JSON unique).
import { colorScheme, useColorScheme } from "nativewind";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { Primitives, ThemeBridge } from "../fixture-core/contracts";

export function useThemeBridge(): ThemeBridge {
  const { colorScheme: current } = useColorScheme();
  return {
    scheme: current === "dark" ? "dark" : "light",
    setScheme: (s) => colorScheme.set(s),
  };
}

export const primitives: Primitives = {
  ScreenShell: ({ title, children }) => (
    <View className="flex-1 bg-light-bg dark:bg-dark-bg">
      <Text className="text-heading font-bold text-light-text dark:text-dark-text p-lg">{title}</Text>
      {children}
    </View>
  ),
  Card: ({ item }) => (
    <View className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-md p-md mx-lg my-xs flex-row items-center">
      <View className="flex-1">
        <Text className="text-body font-semibold text-light-text dark:text-dark-text">{item.title}</Text>
        <Text className="text-label text-light-muted dark:text-dark-muted mt-0.5">{item.subtitle}</Text>
        <View className="bg-light-badgeBg dark:bg-dark-badgeBg rounded-sm px-sm py-0.5 self-start mt-xs">
          <Text className="text-label text-light-muted dark:text-dark-muted">{item.badge}</Text>
        </View>
      </View>
      <Text className="text-body font-bold text-light-primary dark:text-dark-primary ms-md">{item.amount}</Text>
    </View>
  ),
  TextField: ({ label, value, onChangeText, placeholder, error, loading }) => (
    <View className="mb-md">
      <Text className="text-label text-light-muted dark:text-dark-muted mb-xs">{label}</Text>
      <View className="flex-row items-center">
        <TextInput
          className={`flex-1 border rounded-sm px-md py-sm text-body bg-light-surface dark:bg-dark-surface text-light-text dark:text-dark-text ${
            error !== undefined
              ? "border-light-error dark:border-dark-error"
              : "border-light-border dark:border-dark-border"
          }`}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
        />
        {loading === true && <ActivityIndicator className="ms-2" />}
      </View>
      {error !== undefined && (
        <Text className="text-label text-light-error dark:text-dark-error mt-0.5">{error}</Text>
      )}
    </View>
  ),
  AppButton: ({ label, onPress, kind, testID }) => (
    <Pressable
      className={`rounded-md py-md items-center my-sm ${
        kind === "ghost"
          ? "bg-transparent border border-light-primary dark:border-dark-primary"
          : "bg-light-primary dark:bg-dark-primary"
      }`}
      onPress={onPress}
      testID={testID}
    >
      <Text
        className={`font-semibold text-body ${
          kind === "ghost"
            ? "text-light-primary dark:text-dark-primary"
            : "text-light-onPrimary dark:text-dark-onPrimary"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  ),
  Badge: ({ label, tone }) => (
    <View className="bg-light-badgeBg dark:bg-dark-badgeBg rounded-sm px-sm py-0.5 self-start mt-xs">
      <Text
        className={`text-label ${
          tone === "success"
            ? "text-light-success dark:text-dark-success"
            : tone === "warn"
              ? "text-light-warn dark:text-dark-warn"
              : "text-light-muted dark:text-dark-muted"
        }`}
      >
        {label}
      </Text>
    </View>
  ),
  Section: ({ title, children }) => (
    <ScrollView contentContainerClassName="p-lg">
      <Text className="text-title font-semibold text-light-text dark:text-dark-text mb-md">{title}</Text>
      {children}
    </ScrollView>
  ),
};
