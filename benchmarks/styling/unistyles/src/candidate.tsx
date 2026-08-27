// CANDIDAT « unistyles » (react-native-unistyles v3) — mêmes contrats
// partagés, styles thémés via StyleSheet.create((theme) => …).
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { StyleSheet, UnistylesRuntime, useUnistyles } from "react-native-unistyles";
import type { Primitives, ThemeBridge } from "../../fixture-core/contracts";

export function useThemeBridge(): ThemeBridge {
  const { theme } = useUnistyles();
  void theme;
  return {
    scheme: UnistylesRuntime.themeName === "dark" ? "dark" : "light",
    setScheme: (s) => UnistylesRuntime.setTheme(s),
  };
}

const styles = StyleSheet.create((theme) => ({
  shell: { flex: 1, backgroundColor: theme.colors.bg },
  shellTitle: { fontSize: theme.font.heading, fontWeight: "700", color: theme.colors.text, padding: theme.space.lg },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginHorizontal: theme.space.lg,
    marginVertical: theme.space.xs,
    flexDirection: "row",
    alignItems: "center",
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: theme.font.body, fontWeight: "600", color: theme.colors.text },
  cardSubtitle: { fontSize: theme.font.label, color: theme.colors.muted, marginTop: 2 },
  cardAmount: { fontSize: theme.font.body, fontWeight: "700", color: theme.colors.primary, marginStart: theme.space.md },
  badge: {
    backgroundColor: theme.colors.badgeBg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.space.sm,
    paddingVertical: 2,
    alignSelf: "flex-start",
    marginTop: theme.space.xs,
  },
  badgeText: { fontSize: theme.font.label, color: theme.colors.muted },
  badgeSuccess: { color: theme.colors.success },
  badgeWarn: { color: theme.colors.warn },
  fieldWrap: { marginBottom: theme.space.md },
  fieldLabel: { fontSize: theme.font.label, color: theme.colors.muted, marginBottom: theme.space.xs },
  fieldRow: { flexDirection: "row", alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    fontSize: theme.font.body,
  },
  inputError: { borderColor: theme.colors.error },
  fieldError: { color: theme.colors.error, fontSize: theme.font.label, marginTop: 2 },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.md,
    alignItems: "center",
    marginVertical: theme.space.sm,
  },
  buttonGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: theme.colors.primary },
  buttonText: { color: theme.colors.onPrimary, fontWeight: "600", fontSize: theme.font.body },
  buttonGhostText: { color: theme.colors.primary },
  section: { padding: theme.space.lg },
  sectionTitle: { fontSize: theme.font.title, fontWeight: "600", color: theme.colors.text, marginBottom: theme.space.md },
}));

export const primitives: Primitives = {
  ScreenShell: ({ title, children }) => (
    <View style={styles.shell}>
      <Text style={styles.shellTitle}>{title}</Text>
      {children}
    </View>
  ),
  Card: ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.badge}</Text>
        </View>
      </View>
      <Text style={styles.cardAmount}>{item.amount}</Text>
    </View>
  ),
  TextField: ({ label, value, onChangeText, placeholder, error, loading }) => (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        <TextInput
          style={[styles.input, error !== undefined && styles.inputError]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
        />
        {loading === true && <ActivityIndicator style={{ marginStart: 8 }} />}
      </View>
      {error !== undefined && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  ),
  AppButton: ({ label, onPress, kind, testID }) => (
    <Pressable
      style={[styles.button, kind === "ghost" && styles.buttonGhost]}
      onPress={onPress}
      testID={testID}
    >
      <Text style={[styles.buttonText, kind === "ghost" && styles.buttonGhostText]}>{label}</Text>
    </Pressable>
  ),
  Badge: ({ label, tone }) => (
    <View style={styles.badge}>
      <Text style={[styles.badgeText, tone === "success" && styles.badgeSuccess, tone === "warn" && styles.badgeWarn]}>
        {label}
      </Text>
    </View>
  ),
  Section: ({ title, children }) => (
    <ScrollView contentContainerStyle={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </ScrollView>
  ),
};
