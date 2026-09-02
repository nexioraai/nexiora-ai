// @deribfy/primitives — contrats v1 + implémentation StyleSheet+tokens (D-021).
export type {
  A11yProps,
  AppButtonProps,
  AppImageProps,
  AppTextProps,
  BadgeProps,
  ListRowProps,
  Primitives,
  Scheme,
  ScreenShellProps,
  SectionProps,
  SpinnerProps,
  StateViewProps,
  TextFieldProps,
  TextTone,
  TextVariant,
  ThemeBridge,
} from "./contracts.ts";
export {
  AppButton,
  AppImage,
  AppText,
  Badge,
  ListRow,
  primitives,
  ScreenShell,
  Section,
  Spinner,
  StateView,
  TextField,
} from "./primitives.tsx";
// `useStyles` rejoint l'index (D-087) : les blocs en ont besoin pour la
// vignette de ligne, et importer un sous-chemin depuis un paquet aurait créé
// une seconde porte d'entrée là où il n'en faut qu'une.
export { ThemeRoot, useStyles, useThemeBridge } from "./theme-bridge.tsx";
