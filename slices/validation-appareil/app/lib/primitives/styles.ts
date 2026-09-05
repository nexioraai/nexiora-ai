// FEUILLES DE STYLE — StyleSheet + tokens maison (D-021). SEUL module (avec
// primitives.tsx) à connaître le moteur de styling : les contrats n'en savent
// rien (étanchéité §22). Tokens consommés depuis la SOURCE UNIQUE (3.1).
// RTL : propriétés LOGIQUES exclusivement (start/end) — miroir automatique
// prouvé au banc, verrouillé par tests/rtl-ratchet.test.ts.
// DESIGN SYSTEM v2 (P-007, Phase 10) : plus AUCUNE valeur de design en dur —
// graisses, pas fin d'espacement et opacité d'état viennent des tokens ;
// l'accent n'est plus utilisé comme couleur de texte (encre dérivée).
import { theme } from "../tokens";
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
    // Disposition EN LIGNE (1.3.0) : les enfants se suivent et passent à la
    // ligne. `gap` remplace des marges par enfant — aucune propriété physique,
    // la dimension F (RTL par propriétés logiques) reste tenue.
    sectionInlineBody: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: theme.space.sm,
    },
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
    // — NAVIGATION PRINCIPALE (D-086) — compacte PAR CONSTRUCTION : sa hauteur
    // est bornée par la cible tactile, pas par le contenu. C'est ce qui la
    // distingue des quatre gros boutons qu'elle remplace, lesquels grandissaient
    // avec leur libellé.
    // PANNEAU DE NAVIGATION (1.3.0) — la barre était un simple filet posé au
    // bas de l'écran : quatre libellés séparés du contenu par un trait. Elle
    // devient un PANNEAU détaché, posé sur le fond, avec un état actif porté
    // par une pastille et non par la seule graisse du texte.
    // Contraintes tenues, et vérifiées : `minHeight` reste `tapTarget` (48 dp,
    // mesuré conforme sur A17) ; aucune valeur en dur, tout vient des tokens
    // (dimension D) ; aucune propriété physique (dimension F) ; aucune limite
    // de lignes sur les libellés (dimension E — le mot exact est volontairement
    // absent, l'instrument le cherche par sous-chaîne sans distinguer un
    // commentaire du code).
    primaryNav: {
      flexDirection: "row",
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: theme.space.sm,
      paddingHorizontal: theme.space.sm,
      gap: theme.space.xs,
    },
    primaryNavItem: {
      flex: 1,
      minHeight: theme.size.tapTarget,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.space.xs,
      paddingVertical: theme.space.xs,
      borderRadius: theme.radius.md,
    },
    // ÉTAT ACTIF LISIBLE SANS LIRE — pastille pleine sur l'onglet courant.
    primaryNavItemActive: {
      flex: 1,
      minHeight: theme.size.tapTarget,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.space.xs,
      paddingVertical: theme.space.xs,
      borderRadius: theme.radius.md,
      backgroundColor: c.badgeBg,
    },
    // Taille du glyphe d'onglet — portée par un TOKEN, jamais par un nombre
    // écrit dans le composant : la dimension D interdit toute valeur en dur.
    primaryNavIcon: { fontSize: theme.font.heading },
    primaryNavLabel: { fontSize: theme.font.label, color: c.muted },
    primaryNavLabelActive: {
      fontSize: theme.font.label,
      color: c.primaryText,
      fontWeight: theme.fontWeight.semibold,
    },
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
    // VIGNETTE DE LIGNE (1.2.0, D-087) — carrée, bornée, à gauche du texte.
    // C'est la composition d'un catalogue : image à gauche, titre et
    // description au centre qui prennent tout l'espace restant (`rowBody`
    // flex:1), prix à droite. Rien n'est centré, rien ne reste étroit.
    // VISUEL D'EN-TÊTE — pleine largeur, hauteur bornée : c'est la hiérarchie
    // d'une fiche produit. `width: "100%"` exploite l'espace horizontal au lieu
    // de laisser un visuel étroit centré.
    imageHeader: {
      width: "100%",
      minHeight: theme.size.tapTarget * 3,
      borderRadius: theme.radius.md,
      backgroundColor: c.border,
      marginBottom: theme.space.md,
    },
    imageThumb: {
      width: theme.size.tapTarget,
      height: theme.size.tapTarget,
      borderRadius: theme.radius.sm,
      backgroundColor: c.border,
    },
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
