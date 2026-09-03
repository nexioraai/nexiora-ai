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

// F3 (revue pré-gel 2026-08-28) : état DISCRIMINÉ — les libellés d'état
// sont REQUIS exactement quand l'état les rend, et FOURNIS par l'appelant
// (le compilateur, depuis l'AIR/les locales). AUCUN texte par défaut dans
// le moteur : une chaîne codée en dur fuiterait la langue du moteur dans
// des apps de langue arbitraire (i18n structurel, non-négociable 16).
export type ListBlockState =
  | { kind: "ready" }
  | { kind: "loading"; title: string }
  | { kind: "empty"; title: string; message?: string }
  | {
      kind: "error";
      title: string;
      message?: string;
      retryLabel?: string;
      onRetry?: () => void;
    };

export interface ListBlockProps extends BlockA11yProps {
  title?: string;
  items: readonly ListItemData[];
  /** État EXPLICITE (défaut { kind: "ready" }) — jamais déduit des données. */
  state?: ListBlockState;
  onItemPress?: (itemId: string) => void;
}

export interface FormFieldSpec {
  id: string;
  label: string;
  placeholder?: string;
  secure?: boolean;
}

// REGISTRE 1.1.0 (D-060) : `loading` et `empty` entrent dans l'union.
// Fait mesuré : la dimension C d'A++ exige que TOUT bloc consommant des données
// expose loading/empty/error. `form` ne savait exprimer NI l'un NI l'autre — la
// dimension était donc INATTEIGNABLE, pas seulement non atteinte (APP-D003).
// Ajout STRICTEMENT ADDITIF : aucun état retiré, `state` reste optionnel, défaut
// "ready" — un appelant 1.0.0 se comporte à l'identique.
export type FormBlockState = "ready" | "loading" | "empty" | "submitting" | "error";

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
  /** Titres des états `loading`/`empty` — DONNÉES, jamais texte moteur (F3). */
  loadingTitle?: string;
  emptyTitle?: string;
}

export interface ButtonBlockProps extends BlockA11yProps {
  label: string;
  kind?: "primary" | "ghost";
  /**
   * OPTIONNEL depuis 1.1.0 (D-084) — même patron que `onItemPress` du bloc
   * liste : sans gestionnaire, le bouton n'est PAS pressable. Un effet que le
   * moteur n'exécute pas ne doit pas offrir d'affordance. Additif : un appelant
   * qui fournit `onPress` est inchangé.
   */
  onPress?: () => void;
}

export interface EmptyStateBlockProps extends BlockA11yProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

// REGISTRE 1.1.0 (D-060) — même motif que `form` : `detail_header` consomme des
// données et ne portait AUCUN état. Les titres viennent des DONNÉES, jamais du
// moteur (F3) : un état sans titre déclaré n'est donc pas rendu.
export type DetailHeaderBlockState =
  | { kind: "ready" }
  | { kind: "loading"; title: string }
  | { kind: "empty"; title: string; message?: string }
  | { kind: "error"; title: string; message?: string };

export interface DetailHeaderBlockProps extends BlockA11yProps {
  title: string;
  subtitle?: string;
  badges?: readonly string[];
  trailing?: string;
  /** État EXPLICITE (défaut { kind: "ready" }) — jamais déduit des données. */
  state?: DetailHeaderBlockState;
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
