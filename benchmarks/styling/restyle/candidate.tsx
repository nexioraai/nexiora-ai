// CANDIDAT « restyle » (@shopify/restyle v2) — mêmes contrats partagés,
// styles par PROPS TYPÉES depuis le thème : les tokens (source JSON unique)
// deviennent les types autorisés des props (couleurs, espacements, rayons,
// variantes). Thème light/dark = deux objets de thème, bascule par
// ThemeProvider.
import {
  createBox,
  createRestyleComponent,
  createText,
  createTheme,
  createVariant,
  ThemeProvider,
  useTheme,
  type VariantProps,
} from "@shopify/restyle";
import React, { createContext, useContext, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput } from "react-native";
import type { Primitives, Scheme, ThemeBridge } from "../fixture-core/contracts";
import { tokens } from "../fixture-core/tokens.generated";

type Palette = Record<keyof typeof tokens.color.light, string>;
const lightColors: Palette = { ...tokens.color.light };
const darkColors: Palette = { ...tokens.color.dark };

const lightTheme = createTheme({
  colors: lightColors,
  spacing: tokens.space,
  borderRadii: tokens.radius,
  breakpoints: { phone: 0 },
  textVariants: {
    defaults: { color: "text", fontSize: tokens.font.body },
    label: { color: "muted", fontSize: tokens.font.label },
    body: { color: "text", fontSize: tokens.font.body },
    title: { color: "text", fontSize: tokens.font.title, fontWeight: "600" },
    heading: { color: "text", fontSize: tokens.font.heading, fontWeight: "700" },
    amount: { color: "primary", fontSize: tokens.font.body, fontWeight: "700" },
  },
  buttonVariants: {
    defaults: { backgroundColor: "primary", borderRadius: "md", paddingVertical: "md" },
    primary: { backgroundColor: "primary" },
    ghost: { backgroundColor: "surface", borderWidth: 1, borderColor: "primary" },
  },
});

type Theme = typeof lightTheme;
const darkTheme: Theme = { ...lightTheme, colors: darkColors };
const THEMES: Record<Scheme, Theme> = { light: lightTheme, dark: darkTheme };

const SchemeContext = createContext<{ scheme: Scheme; setScheme: (s: Scheme) => void }>({
  scheme: "light",
  setScheme: () => {},
});

export function Root({ children }: React.PropsWithChildren) {
  const [scheme, setScheme] = useState<Scheme>("light");
  const value = useMemo(() => ({ scheme, setScheme }), [scheme]);
  return (
    <SchemeContext.Provider value={value}>
      <ThemeProvider theme={THEMES[scheme]}>{children}</ThemeProvider>
    </SchemeContext.Provider>
  );
}

export function useThemeBridge(): ThemeBridge {
  return useContext(SchemeContext);
}

const Box = createBox<Theme>();
const Text = createText<Theme>();
const Input = createBox<Theme, React.ComponentProps<typeof TextInput>>(TextInput);
const Button = createRestyleComponent<
  VariantProps<Theme, "buttonVariants"> & React.ComponentProps<typeof Pressable>,
  Theme
>([createVariant({ themeKey: "buttonVariants" })], Pressable);

export const primitives: Primitives = {
  ScreenShell: ({ title, children }) => (
    <Box flex={1} backgroundColor="bg">
      <Text variant="heading" padding="lg">
        {title}
      </Text>
      {children}
    </Box>
  ),
  Card: ({ item }) => (
    <Box
      backgroundColor="surface"
      borderColor="border"
      borderWidth={1}
      borderRadius="md"
      padding="md"
      marginHorizontal="lg"
      marginVertical="xs"
      flexDirection="row"
      alignItems="center"
    >
      <Box flex={1}>
        <Text variant="body" fontWeight="600">
          {item.title}
        </Text>
        <Text variant="label" marginTop="xs">
          {item.subtitle}
        </Text>
        <Box
          backgroundColor="badgeBg"
          borderRadius="sm"
          paddingHorizontal="sm"
          alignSelf="flex-start"
          marginTop="xs"
        >
          <Text variant="label">{item.badge}</Text>
        </Box>
      </Box>
      <Text variant="amount" marginStart="md">
        {item.amount}
      </Text>
    </Box>
  ),
  TextField: ({ label, value, onChangeText, placeholder, error, loading }) => {
    const theme = useTheme<Theme>();
    return (
      <Box marginBottom="md">
        <Text variant="label" marginBottom="xs">
          {label}
        </Text>
        <Box flexDirection="row" alignItems="center">
          <Input
            flex={1}
            borderWidth={1}
            borderColor={error !== undefined ? "error" : "border"}
            borderRadius="sm"
            paddingHorizontal="md"
            paddingVertical="sm"
            backgroundColor="surface"
            style={{ color: theme.colors.text, fontSize: tokens.font.body }}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
          />
          {loading === true && <ActivityIndicator style={{ marginStart: theme.spacing.sm }} />}
        </Box>
        {error !== undefined && (
          <Text variant="label" color="error" marginTop="xs">
            {error}
          </Text>
        )}
      </Box>
    );
  },
  AppButton: ({ label, onPress, kind, testID }) => (
    <Button variant={kind === "ghost" ? "ghost" : "primary"} onPress={onPress} testID={testID}>
      <Text
        variant="body"
        fontWeight="600"
        textAlign="center"
        color={kind === "ghost" ? "primary" : "onPrimary"}
      >
        {label}
      </Text>
    </Button>
  ),
  Badge: ({ label, tone }) => (
    <Box
      backgroundColor="badgeBg"
      borderRadius="sm"
      paddingHorizontal="sm"
      alignSelf="flex-start"
      marginTop="xs"
    >
      <Text variant="label" color={tone === "success" ? "success" : tone === "warn" ? "warn" : "muted"}>
        {label}
      </Text>
    </Box>
  ),
  Section: ({ title, children }) => (
    <ScrollView contentContainerStyle={{ padding: tokens.space.lg }}>
      <Text variant="title" marginBottom="md">
        {title}
      </Text>
      {children}
    </ScrollView>
  ),
};
