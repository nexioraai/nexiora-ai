// CONTRATS COMPORTEMENTAUX DES SMART BLOCKS v1 (ROADMAP Phase 3.3, D-023 —
// registre de blocs COMPOSITES DE PRIMITIVES, granularité section d'écran).
//
// RÈGLE D'ÉTANCHÉITÉ (§22, D-021 — même cliquet que les primitives) : ce
// fichier n'importe QUE des types de `react`. Aucun type de styling, aucun
// type react-native — le moteur de styling ET le moteur E2E restent
// remplaçables sans toucher aux contrats des blocs.
//
// Les ÉTATS (loading/empty/error) sont EXPLICITES et contractuels : le bloc
// ne déduit jamais son état de ses données (déterminisme — c'est le
// compilateur/runtime qui décide de l'état, jamais une heuristique).
import type { ComponentType } from "react";

export interface BlockA11yProps {
  testID?: string;
}

export interface HeaderBlockProps extends BlockA11yProps {
  title: string;
  subtitle?: string;
}

export interface ListItemData {
  id: string;
  title: string;
  subtitle?: string;
  trailing?: string;
  badge?: string;
}

export type ListBlockState = "ready" | "loading" | "empty" | "error";

export interface ListBlockProps extends BlockA11yProps {
  title?: string;
  items: readonly ListItemData[];
  /** État EXPLICITE (défaut "ready") — jamais déduit des données. */
  state?: ListBlockState;
  emptyTitle?: string;
  emptyMessage?: string;
  errorTitle?: string;
  errorMessage?: string;
  retryLabel?: string;
  onRetry?: () => void;
  onItemPress?: (itemId: string) => void;
}

export interface FormFieldSpec {
  id: string;
  label: string;
  placeholder?: string;
  secure?: boolean;
}

export type FormBlockState = "ready" | "submitting" | "error";

export interface FormBlockProps extends BlockA11yProps {
  title?: string;
  fields: readonly FormFieldSpec[];
  values: Readonly<Record<string, string>>;
  onChangeField: (fieldId: string, value: string) => void;
  submitLabel: string;
  onSubmit: () => void;
  /** État EXPLICITE (défaut "ready"). */
  state?: FormBlockState;
  errorMessage?: string;
  fieldErrors?: Readonly<Record<string, string>>;
}

export interface ButtonBlockProps extends BlockA11yProps {
  label: string;
  kind?: "primary" | "ghost";
  onPress: () => void;
}

export interface EmptyStateBlockProps extends BlockA11yProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface DetailHeaderBlockProps extends BlockA11yProps {
  title: string;
  subtitle?: string;
  badges?: readonly string[];
  trailing?: string;
}

// Le record complet — la conformité de l'implémentation est vérifiée par le
// compilateur TypeScript (patron des primitives 3.2 et du banc P-003).
export interface Blocks {
  HeaderBlock: ComponentType<HeaderBlockProps>;
  ListBlock: ComponentType<ListBlockProps>;
  FormBlock: ComponentType<FormBlockProps>;
  ButtonBlock: ComponentType<ButtonBlockProps>;
  EmptyStateBlock: ComponentType<EmptyStateBlockProps>;
  DetailHeaderBlock: ComponentType<DetailHeaderBlockProps>;
}
