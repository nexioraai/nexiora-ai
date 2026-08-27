// CANDIDAT « stylesheet » — StyleSheet.create + tokens maison, zéro
// dépendance de styling. Implémente les contrats partagés de fixture-core.
import React, { createContext, useContext, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Primitives, Scheme, ThemeBridge } from "../fixture-core/contracts";
import { tokens, type Palette } from "../fixture-core/tokens.generated";

const SchemeContext = createContext<{ scheme: Scheme; setScheme: (s: Scheme) => void }>({
  scheme: "light",
  setScheme: () => {},
});

export function Root({ children }: React.PropsWithChildren) {
  const [scheme, setScheme] = useState<Scheme>("light");
  const value = useMemo(() => ({ scheme, setScheme }), [scheme]);
  return <SchemeContext.Provider value={value}>{children}</SchemeContext.Provider>;
}

export function useThemeBridge(): ThemeBridge {
  const { scheme, setScheme } = useContext(SchemeContext);
  return { scheme, setScheme };
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    shell: { flex: 1, backgroundColor: c.bg },
    shellTitle: { fontSize: tokens.font.heading, fontWeight: "700", color: c.text, padding: tokens.space.lg },
    card: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: tokens.radius.md,
      padding: tokens.space.md,
      marginHorizontal: tokens.space.lg,
      marginVertical: tokens.space.xs,
      flexDirection: "row",
      alignItems: "center",
    },
    cardBody: { flex: 1 },
    cardTitle: { fontSize: tokens.font.body, fontWeight: "600", color: c.text },
    cardSubtitle: { fontSize: tokens.font.label, color: c.muted, marginTop: 2 },
    cardAmount: { fontSize: tokens.font.body, fontWeight: "700", color: c.primary, marginStart: tokens.space.md },
    badge: {
      backgroundColor: c.badgeBg,
      borderRadius: tokens.radius.sm,
      paddingHorizontal: tokens.space.sm,
      paddingVertical: 2,
      alignSelf: "flex-start",
      marginTop: tokens.space.xs,
    },
    badgeText: { fontSize: tokens.font.label, color: c.muted },
    badgeSuccess: { color: c.success },
    badgeWarn: { color: c.warn },
    fieldWrap: { marginBottom: tokens.space.md },
    fieldLabel: { fontSize: tokens.font.label, color: c.muted, marginBottom: tokens.space.xs },
    fieldRow: { flexDirection: "row", alignItems: "center" },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: tokens.radius.sm,
      paddingHorizontal: tokens.space.md,
      paddingVertical: tokens.space.sm,
      color: c.text,
      backgroundColor: c.surface,
      fontSize: tokens.font.body,
    },
    inputError: { borderColor: c.error },
    fieldError: { color: c.error, fontSize: tokens.font.label, marginTop: 2 },
    button: {
      backgroundColor: c.primary,
      borderRadius: tokens.radius.md,
      paddingVertical: tokens.space.md,
      alignItems: "center",
      marginVertical: tokens.space.sm,
    },
    buttonGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: c.primary },
    buttonText: { color: c.onPrimary, fontWeight: "600", fontSize: tokens.font.body },
    buttonGhostText: { color: c.primary },
    section: { padding: tokens.space.lg },
    sectionTitle: { fontSize: tokens.font.title, fontWeight: "600", color: c.text, marginBottom: tokens.space.md },
  });

const SHEETS: Record<Scheme, ReturnType<typeof makeStyles>> = {
  light: makeStyles(tokens.color.light),
  dark: makeStyles(tokens.color.dark),
};
const useStyles = () => SHEETS[useContext(SchemeContext).scheme];

export const primitives: Primitives = {
  ScreenShell: ({ title, children }) => {
    const s = useStyles();
    return (
      <View style={s.shell}>
        <Text style={s.shellTitle}>{title}</Text>
        {children}
      </View>
    );
  },
  Card: ({ item }) => {
    const s = useStyles();
    return (
      <View style={s.card}>
        <View style={s.cardBody}>
          <Text style={s.cardTitle}>{item.title}</Text>
          <Text style={s.cardSubtitle}>{item.subtitle}</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>{item.badge}</Text>
          </View>
        </View>
        <Text style={s.cardAmount}>{item.amount}</Text>
      </View>
    );
  },
  TextField: ({ label, value, onChangeText, placeholder, error, loading }) => {
    const s = useStyles();
    return (
      <View style={s.fieldWrap}>
        <Text style={s.fieldLabel}>{label}</Text>
        <View style={s.fieldRow}>
          <TextInput
            style={[s.input, error !== undefined && s.inputError]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
          />
          {loading === true && <ActivityIndicator style={{ marginStart: 8 }} />}
        </View>
        {error !== undefined && <Text style={s.fieldError}>{error}</Text>}
      </View>
    );
  },
  AppButton: ({ label, onPress, kind, testID }) => {
    const s = useStyles();
    const ghost = kind === "ghost";
    return (
      <Pressable style={[s.button, ghost && s.buttonGhost]} onPress={onPress} testID={testID}>
        <Text style={[s.buttonText, ghost && s.buttonGhostText]}>{label}</Text>
      </Pressable>
    );
  },
  Badge: ({ label, tone }) => {
    const s = useStyles();
    return (
      <View style={s.badge}>
        <Text style={[s.badgeText, tone === "success" && s.badgeSuccess, tone === "warn" && s.badgeWarn]}>
          {label}
        </Text>
      </View>
    );
  },
  Section: ({ title, children }) => {
    const s = useStyles();
    return (
      <ScrollView contentContainerStyle={s.section}>
        <Text style={s.sectionTitle}>{title}</Text>
        {children}
      </ScrollView>
    );
  },
};
