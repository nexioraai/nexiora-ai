// CANDIDAT « tamagui » — mêmes contrats partagés, primitives via styled().
import React, { createContext, useContext, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, TextInput } from "react-native";
import { styled, TamaguiProvider, Text, Theme, useTheme, View } from "tamagui";
import type { Primitives, Scheme, ThemeBridge } from "../fixture-core/contracts";
import { tokens } from "../fixture-core/tokens.generated";
import config from "./tamagui.config";

const SchemeContext = createContext<{ scheme: Scheme; setScheme: (s: Scheme) => void }>({
  scheme: "light",
  setScheme: () => {},
});

export function Root({ children }: React.PropsWithChildren) {
  const [scheme, setScheme] = useState<Scheme>("light");
  const value = useMemo(() => ({ scheme, setScheme }), [scheme]);
  return (
    <TamaguiProvider config={config} defaultTheme="light">
      <SchemeContext.Provider value={value}>
        <Theme name={scheme}>{children}</Theme>
      </SchemeContext.Provider>
    </TamaguiProvider>
  );
}

export function useThemeBridge(): ThemeBridge {
  const { scheme, setScheme } = useContext(SchemeContext);
  return { scheme, setScheme };
}

const Shell = styled(View, { flex: 1, backgroundColor: "$bg" });
const ShellTitle = styled(Text, { fontSize: tokens.font.heading, fontWeight: "700", color: "$text", padding: "$lg" });
const CardBox = styled(View, {
  backgroundColor: "$surface",
  borderColor: "$border",
  borderWidth: 1,
  borderRadius: "$md",
  padding: "$md",
  marginHorizontal: "$lg",
  marginVertical: "$xs",
  flexDirection: "row",
  alignItems: "center",
});
const CardTitle = styled(Text, { fontSize: tokens.font.body, fontWeight: "600", color: "$text" });
const CardSubtitle = styled(Text, { fontSize: tokens.font.label, color: "$muted", marginTop: 2 });
const CardAmount = styled(Text, { fontSize: tokens.font.body, fontWeight: "700", color: "$primary", marginStart: "$md" });
const BadgeBox = styled(View, {
  backgroundColor: "$badgeBg",
  borderRadius: "$sm",
  paddingHorizontal: "$sm",
  paddingVertical: 2,
  alignSelf: "flex-start",
  marginTop: "$xs",
});
const BadgeText = styled(Text, {
  fontSize: tokens.font.label,
  color: "$muted",
  variants: {
    tone: { info: { color: "$muted" }, success: { color: "$success" }, warn: { color: "$warn" } },
  } as const,
});
const FieldLabel = styled(Text, { fontSize: tokens.font.label, color: "$muted", marginBottom: "$xs" });
const FieldError = styled(Text, { color: "$error", fontSize: tokens.font.label, marginTop: 2 });
const ButtonBox = styled(View, {
  backgroundColor: "$primary",
  borderRadius: "$md",
  paddingVertical: "$md",
  alignItems: "center",
  marginVertical: "$sm",
  variants: {
    ghost: { true: { backgroundColor: "transparent", borderWidth: 1, borderColor: "$primary" } },
  } as const,
});
const ButtonLabel = styled(Text, {
  color: "$onPrimary",
  fontWeight: "600",
  fontSize: tokens.font.body,
  variants: { ghost: { true: { color: "$primary" } } } as const,
});
const SectionTitle = styled(Text, { fontSize: tokens.font.title, fontWeight: "600", color: "$text", marginBottom: "$md" });

function ThemedInput({ error, ...rest }: React.ComponentProps<typeof TextInput> & { error?: boolean }) {
  const theme = useTheme();
  return (
    <TextInput
      {...rest}
      style={{
        flex: 1,
        borderWidth: 1,
        borderColor: error === true ? theme.error?.get() : theme.border?.get(),
        borderRadius: tokens.radius.sm,
        paddingHorizontal: tokens.space.md,
        paddingVertical: tokens.space.sm,
        color: theme.text?.get(),
        backgroundColor: theme.surface?.get(),
        fontSize: tokens.font.body,
      }}
    />
  );
}

export const primitives: Primitives = {
  ScreenShell: ({ title, children }) => (
    <Shell>
      <ShellTitle>{title}</ShellTitle>
      {children}
    </Shell>
  ),
  Card: ({ item }) => (
    <CardBox>
      <View flex={1}>
        <CardTitle>{item.title}</CardTitle>
        <CardSubtitle>{item.subtitle}</CardSubtitle>
        <BadgeBox>
          <BadgeText>{item.badge}</BadgeText>
        </BadgeBox>
      </View>
      <CardAmount>{item.amount}</CardAmount>
    </CardBox>
  ),
  TextField: ({ label, value, onChangeText, placeholder, error, loading }) => (
    <View marginBottom="$md">
      <FieldLabel>{label}</FieldLabel>
      <View flexDirection="row" alignItems="center">
        <ThemedInput value={value} onChangeText={onChangeText} placeholder={placeholder} error={error !== undefined} />
        {loading === true && <ActivityIndicator style={{ marginStart: 8 }} />}
      </View>
      {error !== undefined && <FieldError>{error}</FieldError>}
    </View>
  ),
  AppButton: ({ label, onPress, kind, testID }) => (
    <ButtonBox ghost={kind === "ghost"} onPress={onPress} testID={testID}>
      <ButtonLabel ghost={kind === "ghost"}>{label}</ButtonLabel>
    </ButtonBox>
  ),
  Badge: ({ label, tone }) => (
    <BadgeBox>
      <BadgeText tone={tone ?? "info"}>{label}</BadgeText>
    </BadgeBox>
  ),
  Section: ({ title, children }) => (
    <ScrollView contentContainerStyle={{ padding: tokens.space.lg }}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </ScrollView>
  ),
};
