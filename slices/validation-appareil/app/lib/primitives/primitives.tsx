// LES 9 PRIMITIVES v1 (dossier 3.2 validé : B2) — implémentation
// StyleSheet + tokens maison (D-021). Simple et composable, sans mécanisme
// « au cas où » : chaque primitive est exigée par un bloc de 3.3 ou par le
// harnais 3.4. Les rôles a11y sont posés ici (C2) ; les contrats n'exposent
// que testID/accessibilityLabel.
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";
import type {
  AppImageProps,
  AppButtonProps,
  AppTextProps,
  BadgeProps,
  ListRowProps,
  Primitives,
  ScreenShellProps,
  SectionProps,
  SpinnerProps,
  StateViewProps,
  TextFieldProps,
  TextVariant,
} from "./contracts.ts";
import { useStyles } from "./theme-bridge.tsx";
import type { Sheet } from "./styles.ts";

const VARIANT_STYLE: Record<TextVariant, keyof Sheet> = {
  label: "textLabel",
  body: "textBody",
  title: "textTitle",
  heading: "textHeading",
};

export function ScreenShell({ children, testID, accessibilityLabel }: ScreenShellProps) {
  const s = useStyles();
  return (
    // DET-017 volet 1 (D-039, dimension I) — le titre VISIBLE est retiré.
    // Cause démontrée par deux méthodes indépendantes : ce Text et l'en-tête
    // de navigation (`options.title`) dérivent de la MÊME donnée AIR
    // (`screen.title`), la répétition était donc structurelle sur les 47
    // écrans du corpus. `headerShown` n'est désactivé NULLE PART : l'en-tête
    // natif est toujours rendu et porte désormais seul le titre, à la place
    // que la convention de plateforme lui assigne.
    // DET-020 (Phase 10) — le repli `accessibilityLabel ?? title` est RETIRÉ.
    // Mesuré sur RN 0.86.3 : `AccessibilityProps.h` pose `accessible{false}`
    // et `RCTViewComponentView.mm` lie `isAccessibilityElement` à cette prop
    // — le label d'un conteneur non `accessible` n'est donc PAS restitué par
    // VoiceOver. Sur Android il posait en revanche une `contentDescription`
    // sur le conteneur racine des écrans, dont l'effet TalkBack n'a jamais
    // été mesuré. Livrer un comportement inerte d'un côté et non mesuré de
    // l'autre, pour un bénéfice nul, est pire que ne rien livrer.
    // La sémantique de titre d'écran est portée par l'EN-TÊTE NATIF, qui la
    // reçoit de la même donnée AIR et n'est désactivé nulle part.
    // Contrat INCHANGÉ : `title` demeure requis par ScreenShellProps.
    <View style={s.shell} testID={testID} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}

export function Section({
  title,
  children,
  testID,
  accessibilityLabel,
  fill = false,
  inline = false,
}: SectionProps) {
  const s = useStyles();
  // DET-025 — `fill` était DÉCLARÉ par le contrat, PORTÉ par les styles,
  // DEMANDÉ par ListBlock… et ignoré ici. La liste virtualisée n'avait donc
  // aucun parent borné : sur appareil, le conteneur débordait de l'écran,
  // la dernière ligne était coupée et le bloc suivant devenait inatteignable
  // (mesuré : FlatList jusqu'à y=2400 = bas d'écran exact, `empty_state`
  // entièrement hors écran). C'est la correction que DET-006 croyait avoir
  // faite : le contrat et les styles étaient bons, le câblage manquait.
  return (
    <View
      style={fill ? [s.section, s.sectionFill] : s.section}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    >
      {title !== undefined && <Text style={s.sectionTitle}>{title}</Text>}
      {fill ? (
        <View style={s.sectionFillBody}>{children}</View>
      ) : inline ? (
        <View style={s.sectionInlineBody}>{children}</View>
      ) : (
        children
      )}
    </View>
  );
}

export function AppText({
  variant = "body",
  tone = "default",
  align,
  children,
  testID,
  accessibilityLabel,
}: AppTextProps) {
  const s = useStyles();
  return (
    <Text
      style={[
        s[VARIANT_STYLE[variant]],
        tone === "muted" && s.toneMuted,
        tone === "primary" && s.tonePrimary,
        tone === "error" && s.toneError,
        tone === "success" && s.toneSuccess,
        tone === "warn" && s.toneWarn,
        align === "center" && s.alignCenter,
        align === "end" && s.alignEnd,
      ]}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Text>
  );
}

export function AppButton({
  label,
  onPress,
  kind = "primary",
  selected,
  disabled = false,
  loading = false,
  testID,
  accessibilityLabel,
}: AppButtonProps) {
  const s = useStyles();
  const ghost = kind === "ghost";
  const chip = kind === "chip";
  const inactive = disabled || loading;
  return (
    <Pressable
      style={[chip ? s.buttonChip : s.button, ghost && s.buttonGhost, inactive && s.buttonDisabled]}
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{
        disabled: inactive,
        busy: loading,
        // 1.5.0 (DET-034) : l'état sélectionné se DIT — comme la navigation.
        ...(selected === undefined ? {} : { selected }),
      }}
    >
      {loading && <ActivityIndicator size="small" />}
      {chip ? (
        // La CIBLE (Pressable) garde tapTarget ; le VISUEL est un badge.
        <View style={[s.buttonChipVisuel, selected === true && s.buttonChipVisuelActif]}>
          <Text style={[s.buttonChipText, selected === true && s.buttonChipTextActif]}>{label}</Text>
        </View>
      ) : (
        <Text style={[s.buttonText, ghost && s.buttonGhostText]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  loading = false,
  secure = false,
  testID,
  accessibilityLabel,
}: TextFieldProps) {
  const s = useStyles();
  return (
    <View style={s.fieldWrap} testID={testID}>
      {/* DET-033 : un libellé VIDE ne rend rien — un champ compact (recherche)
          porte son sens par `placeholder` + `accessibilityLabel`, sans ligne
          fantôme au-dessus. Contrat inchangé. */}
      {label === "" ? null : <Text style={s.fieldLabel}>{label}</Text>}
      <View style={s.fieldRow}>
        <TextInput
          style={[s.input, error !== undefined && s.inputError]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          secureTextEntry={secure}
          accessibilityLabel={accessibilityLabel ?? label}
        />
        {loading && <ActivityIndicator size="small" style={s.fieldSpinner} />}
      </View>
      {error !== undefined && (
        <Text style={s.fieldError} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

export function AppImage({ uri, variant, testID, accessibilityLabel }: AppImageProps) {
  const s = useStyles();
  return (
    <Image
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      source={{ uri }}
      style={variant === "thumb" ? s.imageThumb : s.imageHeader}
      accessibilityIgnoresInvertColors
    />
  );
}

export function ListRow({
  title,
  subtitle,
  badge,
  trailing,
  leading,
  onPress,
  testID,
  accessibilityLabel,
}: ListRowProps) {
  const s = useStyles();
  const body = (
    <>
      {leading !== undefined && <View style={s.rowLeading}>{leading}</View>}
      <View style={s.rowBody}>
        <Text style={s.rowTitle}>{title}</Text>
        {subtitle !== undefined && <Text style={s.rowSubtitle}>{subtitle}</Text>}
        {badge !== undefined && <Badge label={badge} />}
      </View>
      {trailing !== undefined && <Text style={s.rowTrailing}>{trailing}</Text>}
    </>
  );
  if (onPress === undefined) {
    return (
      <View style={s.row} testID={testID} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      style={s.row}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
    >
      {body}
    </Pressable>
  );
}

export function Badge({ label, tone = "info", testID, accessibilityLabel }: BadgeProps) {
  const s = useStyles();
  return (
    <View style={s.badge} testID={testID} accessibilityLabel={accessibilityLabel}>
      <Text
        style={[
          s.badgeText,
          tone === "success" && s.badgeSuccess,
          tone === "warn" && s.badgeWarn,
          tone === "error" && s.badgeError,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function StateView({
  state,
  title,
  message,
  actionLabel,
  onAction,
  testID,
  accessibilityLabel,
}: StateViewProps) {
  const s = useStyles();
  return (
    <View
      style={s.stateWrap}
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole={state === "error" ? "alert" : undefined}
    >
      {state === "loading" && <ActivityIndicator size="large" />}
      <Text style={[s.stateTitle, state === "error" && s.stateTitleError]}>{title}</Text>
      {message !== undefined && <Text style={s.stateMessage}>{message}</Text>}
      {actionLabel !== undefined && onAction !== undefined && (
        <AppButton label={actionLabel} onPress={onAction} kind="ghost" />
      )}
    </View>
  );
}

export function Spinner({ size = "small", testID, accessibilityLabel }: SpinnerProps) {
  return (
    <ActivityIndicator size={size} testID={testID} accessibilityLabel={accessibilityLabel} />
  );
}

// Conformité au contrat vérifiée par le compilateur (patron du banc P-003).
export const primitives: Primitives = {
  ScreenShell,
  Section,
  AppText,
  AppButton,
  TextField,
  AppImage,
  ListRow,
  Badge,
  StateView,
  Spinner,
};
