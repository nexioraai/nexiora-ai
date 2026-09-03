// Enregistrement des thèmes Unistyles depuis la SOURCE DE TOKENS UNIQUE.
import { StyleSheet } from "react-native-unistyles";
import { tokens } from "../../fixture-core/tokens.generated";

const themes = {
  light: { colors: tokens.color.light, space: tokens.space, radius: tokens.radius, font: tokens.font },
  dark: { colors: tokens.color.dark, space: tokens.space, radius: tokens.radius, font: tokens.font },
} as const;

type AppThemes = typeof themes;
declare module "react-native-unistyles" {
  export interface UnistylesThemes extends AppThemes {}
}

StyleSheet.configure({ themes, settings: { initialTheme: "light" } });
