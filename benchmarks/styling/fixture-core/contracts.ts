// P-003 — CONTRATS DE PRIMITIVES PARTAGÉS (fichier UNIQUE — preuve
// d'étanchéité contractuelle du protocole : les 3 écrans compilent avec ces
// MÊMES contrats pour les 4 candidats ; aucun type d'une bibliothèque de
// styling ne doit apparaître ici).
import type { ComponentType, PropsWithChildren } from "react";

export type Scheme = "light" | "dark";

export interface CardData {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  amount: string;
}

export interface CardProps {
  item: CardData;
  index: number;
}

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  error?: string;
  loading?: boolean;
}

export interface ButtonProps {
  label: string;
  onPress: () => void;
  kind?: "primary" | "ghost";
  testID?: string;
}

export interface BadgeProps {
  label: string;
  tone?: "info" | "success" | "warn";
}

export type ScreenShellProps = PropsWithChildren<{ title: string }>;
export type SectionProps = PropsWithChildren<{ title: string }>;

export interface Primitives {
  ScreenShell: ComponentType<ScreenShellProps>;
  Card: ComponentType<CardProps>;
  TextField: ComponentType<TextFieldProps>;
  AppButton: ComponentType<ButtonProps>;
  Badge: ComponentType<BadgeProps>;
  Section: ComponentType<SectionProps>;
}

export interface ThemeBridge {
  scheme: Scheme;
  setScheme: (scheme: Scheme) => void;
}
