// CONTRATS DE PRIMITIVES v1 (ROADMAP Phase 3.2 — dossier d'options validé
// par le propriétaire : A1+B2+C2+D1).
//
// RÈGLE D'ÉTANCHÉITÉ (ARCHITECTURE §22, D-021, prouvée 6/6 au banc P-003,
// verrouillée par tests/contracts-ratchet.test.ts) : ce fichier n'importe
// QUE des types de `react`. Aucun type de bibliothèque de styling, aucun
// type react-native, aucune valeur — le moteur de styling reste remplaçable
// sans toucher ni aux contrats, ni aux blocs, ni à l'AIR.
//
// Surface a11y minimale (C2) : `testID` partout ; `accessibilityLabel` sur
// les primitives interactives/informatives. Les RÔLES a11y sont posés par
// l'implémentation (détail interne, pas contractuel).
import type { ComponentType, PropsWithChildren, ReactNode } from "react";

export type Scheme = "light" | "dark";

export interface A11yProps {
  testID?: string;
  accessibilityLabel?: string;
}

// Les 4 variantes de texte = les 4 tokens de police de la source unique.
export type TextVariant = "label" | "body" | "title" | "heading";
export type TextTone = "default" | "muted" | "primary" | "error" | "success" | "warn";

export type AppTextProps = PropsWithChildren<
  A11yProps & {
    variant?: TextVariant;
    tone?: TextTone;
    /** Alignement LOGIQUE (miroir RTL automatique) — jamais left/right. */
    align?: "start" | "center" | "end";
  }
>;

export type ScreenShellProps = PropsWithChildren<A11yProps & { title: string }>;

export type SectionProps = PropsWithChildren<A11yProps & { title?: string }>;

export interface AppButtonProps extends A11yProps {
  label: string;
  onPress: () => void;
  kind?: "primary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
}

export interface TextFieldProps extends A11yProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string;
  loading?: boolean;
  /** Saisie masquée (AuthFlow — mot de passe). */
  secure?: boolean;
}

export interface ListRowProps extends A11yProps {
  title: string;
  subtitle?: string;
  badge?: string;
  /** Texte de fin de ligne (prix, valeur, méta) — position logique RTL. */
  trailing?: string;
  /** Contenu de tête de ligne fourni par le bloc (avatar, icône…). */
  leading?: ReactNode;
  onPress?: () => void;
}

export interface BadgeProps extends A11yProps {
  label: string;
  tone?: "info" | "success" | "warn" | "error";
}

export interface StateViewProps extends A11yProps {
  state: "loading" | "empty" | "error";
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface SpinnerProps extends A11yProps {
  size?: "small" | "large";
}

// Le record complet — la conformité d'une implémentation est vérifiée par
// le compilateur TypeScript (patron éprouvé au banc P-003).
export interface Primitives {
  ScreenShell: ComponentType<ScreenShellProps>;
  Section: ComponentType<SectionProps>;
  AppText: ComponentType<AppTextProps>;
  AppButton: ComponentType<AppButtonProps>;
  TextField: ComponentType<TextFieldProps>;
  ListRow: ComponentType<ListRowProps>;
  Badge: ComponentType<BadgeProps>;
  StateView: ComponentType<StateViewProps>;
  Spinner: ComponentType<SpinnerProps>;
}

export interface ThemeBridge {
  scheme: Scheme;
  setScheme: (scheme: Scheme) => void;
}
