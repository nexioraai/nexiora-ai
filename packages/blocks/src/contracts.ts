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

/**
 * RECHERCHE DANS UNE LISTE (1.2.0, D-087) — état tenu par l'appelant.
 *
 * Le bloc ne possède pas la saisie : il la reçoit et la restitue. C'est ce qui
 * lui permet de rester un composant PUR, testable sans monter d'application.
 */
export interface ListSearchSpec {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export interface ListItemData {
  id: string;
  /** Vignette de la ligne (1.2.0) — absente = ligne purement textuelle. */
  imageUri?: string;
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
export const LIST_BLOCK_STATES = ["ready", "loading", "empty", "error"] as const;
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
  /** Recherche rendue EN TÊTE de la liste (1.2.0) — absente = pas de champ. */
  search?: ListSearchSpec;
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
// D-095 — SOURCE UNIQUE DES ÉTATS. Le tableau est la déclaration ; le type en
// DÉRIVE. Le registre pointe sur ce même tableau. Il n'existe donc plus de
// seconde liste à tenir à jour, et la dérive mesurée en F5 devient impossible
// par construction — pas seulement détectée.
export const FORM_BLOCK_STATES = ["ready", "loading", "empty", "submitting", "error"] as const;
export type FormBlockState = (typeof FORM_BLOCK_STATES)[number];

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
export const DETAIL_HEADER_BLOCK_STATES = ["ready", "loading", "empty", "error"] as const;
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
  /**
   * VISUEL D'EN-TÊTE (1.2.0, D-087) — une fiche de plat, de bien ou d'article
   * sans image n'est pas une fiche. Absent = aucun visuel rendu, comportement
   * 1.1.0 inchangé.
   */
  imageUri?: string;
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

// ── D-095 · LIAISON VÉRIFIÉE PAR LE COMPILATEUR.
//
// Pour les unions DISCRIMINÉES, chaque variante porte des champs différents :
// le tableau ne peut pas engendrer l'union. Il l'ENCADRE. Ces deux assertions
// échouent à la compilation si le tableau et l'union divergent, dans un sens
// comme dans l'autre — c'est la garantie que `BLOCKS[].states` n'avait pas.
type MemeEnsemble<A extends string, B extends string> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : never
  : never;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ListeLiee = MemeEnsemble<ListBlockState["kind"], (typeof LIST_BLOCK_STATES)[number]>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _DetailLie = MemeEnsemble<
  DetailHeaderBlockState["kind"],
  (typeof DETAIL_HEADER_BLOCK_STATES)[number]
>;

// Blocs SANS prop `state` : ils ne rendent qu'un état, déclaré ici pour que
// contracts.ts reste l'unique source des six blocs.
export const BUTTON_BLOCK_STATES = ["ready"] as const;
export const HEADER_BLOCK_STATES = ["ready"] as const;
export const EMPTY_STATE_BLOCK_STATES = ["empty"] as const;
