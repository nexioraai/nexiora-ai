// FEUILLES DE STYLE — StyleSheet + tokens maison (D-021). SEUL module (avec
// primitives.tsx) à connaître le moteur de styling : les contrats n'en savent
// rien (étanchéité §22). Tokens consommés depuis la SOURCE UNIQUE (3.1).
// RTL : propriétés LOGIQUES exclusivement (start/end) — miroir automatique
// prouvé au banc, verrouillé par tests/rtl-ratchet.test.ts.
// DESIGN SYSTEM v2 (P-007, Phase 10) : plus AUCUNE valeur de design en dur —
// graisses, pas fin d'espacement et opacité d'état viennent des tokens ;
// l'accent n'est plus utilisé comme couleur de texte (encre dérivée).
import { theme } from "@deribfy/design-tokens";
import { StyleSheet } from "react-native";
import type { Scheme } from "./contracts.ts";

export type Palette = (typeof theme.color)[Scheme];

const makeSheet = (c: Palette) =>
  StyleSheet.create({
    // — ScreenShell —
    shell: { flex: 1, backgroundColor: c.bg },
    shellTitle: {
      fontSize: theme.font.heading,
      fontWeight: theme.fontWeight.bold,
      color: c.text,
      padding: theme.space.lg,
    },
    // — Section —
    section: { padding: theme.space.lg },
    // DET-006 : section qui remplit et BORNE sa hauteur, plus conteneur
    // d'enfants borné — la liste virtualisée y retrouve une fenêtre finie.
    sectionFill: { flex: 1 },
    sectionFillBody: { flex: 1 },
    sectionTitle: {
      fontSize: theme.font.title,
      fontWeight: theme.fontWeight.semibold,
      color: c.text,
      marginBottom: theme.space.md,
    },
    // — AppText (variantes = tokens de police ; tons = tokens de couleur) —
    textLabel: { fontSize: theme.font.label, color: c.text },
    textBody: { fontSize: theme.font.body, color: c.text },
    textTitle: { fontSize: theme.font.title, fontWeight: theme.fontWeight.semibold, color: c.text },
    textHeading: { fontSize: theme.font.heading, fontWeight: theme.fontWeight.bold, color: c.text },
    toneMuted: { color: c.muted },
    tonePrimary: { color: c.primaryText },
    toneError: { color: c.error },
    toneSuccess: { color: c.success },
    toneWarn: { color: c.warn },
    alignStart: { textAlign: "auto" },
    alignCenter: { textAlign: "center" },
    // `justify` n'existe pas ; « end » logique = right en LTR, miroir en RTL
    // est géré par writingDirection native — on utilise l'axe logique :
    alignEnd: { alignSelf: "flex-end" },
    // — AppButton —
    button: {
      minHeight: theme.size.tapTarget,
      backgroundColor: c.primary,
      borderRadius: theme.radius.md,
      paddingVertical: theme.space.md,
      paddingHorizontal: theme.space.lg,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: theme.space.sm,
    },
    buttonGhost: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: c.primary,
    },
    buttonDisabled: { opacity: theme.opacity.disabled },
    buttonText: { color: c.onPrimary, fontWeight: theme.fontWeight.semibold, fontSize: theme.font.body },
    buttonGhostText: { color: c.primaryText },
    // — TextField —
    fieldWrap: { marginBottom: theme.space.md },
    fieldLabel: {
      fontSize: theme.font.label,
      color: c.muted,
      marginBottom: theme.space.xs,
    },
    fieldRow: { flexDirection: "row", alignItems: "center" },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: theme.radius.sm,
      minHeight: theme.size.tapTarget,
      paddingHorizontal: theme.space.md,
      paddingVertical: theme.space.sm,
      color: c.text,
      backgroundColor: c.surface,
      fontSize: theme.font.body,
    },
    inputError: { borderColor: c.error },
    fieldError: {
      color: c.error,
      fontSize: theme.font.label,
      marginTop: theme.space.xs,
    },
    fieldSpinner: { marginStart: theme.space.sm },
    // — ListRow —
    row: {
      minHeight: theme.size.tapTarget,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      padding: theme.space.md,
      marginHorizontal: theme.space.lg,
      marginVertical: theme.space.xs,
      flexDirection: "row",
      alignItems: "center",
    },
    rowLeading: { marginEnd: theme.space.md },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: theme.font.body, fontWeight: theme.fontWeight.semibold, color: c.text },
    rowSubtitle: {
      fontSize: theme.font.label,
      color: c.muted,
      marginTop: theme.space.xs,
    },
    rowTrailing: {
      fontSize: theme.font.body,
      fontWeight: theme.fontWeight.bold,
      // v2 (DET-019) : encre DÉRIVÉE de l'accent — l'accent lui-même reste
      // réservé aux FONDS et aux bordures, où le seuil 4,5:1 ne s'applique
      // pas au texte. Mesuré : 2,95:1 avant, 4,57:1 après.
      color: c.primaryText,
      marginStart: theme.space.md,
    },
    // — Badge —
    badge: {
      backgroundColor: c.badgeBg,
      borderRadius: theme.radius.sm,
      paddingHorizontal: theme.space.sm,
      paddingVertical: theme.space.xxs,
      alignSelf: "flex-start",
      marginTop: theme.space.xs,
    },
    badgeText: { fontSize: theme.font.label, color: c.muted },
    badgeSuccess: { color: c.success },
    badgeWarn: { color: c.warn },
    badgeError: { color: c.error },
    // — StateView —
    stateWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.space.xl,
      gap: theme.space.md,
    },
    stateTitle: {
      fontSize: theme.font.title,
      fontWeight: theme.fontWeight.semibold,
      color: c.text,
      textAlign: "center",
    },
    stateMessage: {
      fontSize: theme.font.body,
      color: c.muted,
      textAlign: "center",
    },
    stateTitleError: { color: c.error },
  });

export type Sheet = ReturnType<typeof makeSheet>;

// Pré-calcul UNIQUE des deux feuilles (patron gagnant du banc : la bascule
// de thème ne recrée aucun style, elle change de feuille).
export const SHEETS: Record<Scheme, Sheet> = {
  light: makeSheet(theme.color.light),
  dark: makeSheet(theme.color.dark),
};
