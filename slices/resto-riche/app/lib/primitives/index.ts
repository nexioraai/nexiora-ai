// @deribfy/primitives — contrats v1 + implémentation StyleSheet+tokens (D-021).
export type {
  A11yProps,
  AppButtonProps,
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
export { ThemeRoot, useThemeBridge } from "./theme-bridge.tsx";
