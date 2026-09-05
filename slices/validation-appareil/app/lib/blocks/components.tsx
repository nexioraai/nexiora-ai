// LES 6 SMART BLOCKS v1 — composites DE PRIMITIVES exclusivement (D-023).
// RÈGLE MÉCANISÉE (tests/etancheite-ratchet.test.ts) : tout le visuel passe
// par @deribfy/primitives ; seul composant react-native autorisé ici :
// FlatList (structurel). AUCUN StyleSheet, AUCUN style en dur — le moteur
// de styling reste remplaçable (D-021) et les tokens restent la seule
// source visuelle. AUCUNE syntaxe Maestro/Detox : les blocs sont
// E2E-agnostiques (D-022/D-023), seuls les testID standard sont exposés.
import { FlatList } from "react-native";
import {
  AppButton,
  AppText,
  Badge,
  ListRow,
  Section,
  StateView,
  AppImage,
  TextField,
} from "../primitives";
import type {
  Blocks,
  ButtonBlockProps,
  DetailHeaderBlockProps,
  EmptyStateBlockProps,
  FormBlockProps,
  HeaderBlockProps,
  ListBlockProps,
} from "./contracts.ts";

export function HeaderBlock({ title, subtitle, testID }: HeaderBlockProps) {
  return (
    <Section testID={testID}>
      <AppText variant="heading">{title}</AppText>
      {subtitle !== undefined && <AppText tone="muted">{subtitle}</AppText>}
    </Section>
  );
}

export function ListBlock({
  title,
  items,
  state = { kind: "ready" },
  search,
  filters,
  onItemPress,
  testID,
}: ListBlockProps) {
  // DET-033 (jugement propriétaire sur appareil) : les états ne remplacent
  // plus le BLOC ENTIER — ils ne remplacent que la ZONE DE CONTENU. Avant,
  // une saisie sans correspondance faisait rendre l'état vide À LA PLACE du
  // champ de recherche : le champ disparaissait sous les doigts, clavier
  // fermé. Recherche et filtres restent MONTÉS quel que soit l'état, et
  // vivent DANS la liste (en-tête défilant) : une seule surface de
  // défilement, plus deux régions étanches.
  const etatContenu =
    state.kind === "loading" ? (
      <StateView state="loading" title={state.title} />
    ) : state.kind === "empty" ? (
      <StateView state="empty" title={state.title} message={state.message} />
    ) : state.kind === "error" ? (
      <StateView
        state="error"
        title={state.title}
        message={state.message}
        actionLabel={state.retryLabel}
        onAction={state.onRetry}
      />
    ) : null;
  // Contrôles TOUJOURS montés (élément stable : l'identité du TextField
  // survit aux rendus — le focus et le clavier survivent avec elle).
  const controles = (
    <>
      {search === undefined ? null : (
        <TextField
          testID={`${testID ?? "list"}-search`}
          // DET-033 : champ compact — le sens passe par `placeholder`, la
          // ligne de libellé disparaît, l'accessibilité garde son nom.
          label=""
          accessibilityLabel={search.placeholder}
          placeholder={search.placeholder}
          value={search.value}
          onChangeText={search.onChange}
        />
      )}
      {/* E1 (D-129) — filtres pilotés : la saisie appartient à l'appelant. */}
      {(filters ?? []).map((f, i) =>
        f.inputType === "text" ? (
          <TextField
            key={`${testID ?? "list"}-filter-${String(i)}`}
            testID={`${testID ?? "list"}-filter-${String(i)}`}
            label={f.label}
            value={f.value}
            onChangeText={f.onChange}
          />
        ) : (
          <Section key={`${testID ?? "list"}-filter-${String(i)}`} title={f.label} inline>
            {(f.options ?? []).map((option) => (
              <AppButton
                key={option}
                testID={`${testID ?? "list"}-filter-${String(i)}-${option}`}
                // DET-032 : le libellé peut différer de la VALEUR — le testID,
                // le filtrage et onChange restent sur l'option brute.
                label={f.optionLabels?.[option] ?? option}
                kind={f.value === option ? "primary" : "ghost"}
                onPress={() => {
                  f.onChange(f.value === option ? "" : option);
                }}
              />
            ))}
          </Section>
        ),
      )}
    </>
  );
  return (
    // `fill` (DET-006) : la section BORNE la hauteur de la liste virtualisée.
    // Sans parent borné, la FlatList rend tous ses éléments. L'intention est
    // DÉCLARÉE ici ; le style reste entièrement porté par les primitives —
    // la contrainte « aucun StyleSheet, aucun style en dur » est préservée.
    <Section title={title} testID={testID} fill>
      <FlatList
        // DET-016 (D-039, dimension A étendue) : ajustement natif aux insets
        // du clavier. Propriété VÉRIFIÉE sur RN 0.86.3 — déclarée dans
        // `ScrollViewPropsIOS`, sans implémentation Android : elle agit sur
        // iOS et reste INERTE sur Android, qui est couvert par le mode de
        // redimensionnement déclaré au manifeste. Aucun `Platform.OS` requis.
        // `keyboardShouldPersistTaps` évite qu'un appui sur un contrôle
        // pendant l'édition soit absorbé par la fermeture du clavier.
        // Ce sont des PROPRIÉTÉS structurelles, jamais des styles.
        // DET-033 : recherche et filtres vivent EN-TÊTE DE LISTE — une seule
        // surface de défilement — et l'état (chargement/vide/erreur) ne
        // remplace que la zone de contenu, via ListEmptyComponent.
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={controles}
        ListEmptyComponent={etatContenu}
        data={state.kind === "ready" ? items : []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ListRow
            // VIGNETTE (1.2.0, D-087) : `leading` existait deja au contrat de
            // la primitive. Sans `imageUri`, la ligne reste celle de 1.1.0.
            leading={
              item.imageUri === undefined ? undefined : (
                <AppImage uri={item.imageUri} variant="thumb" />
              )
            }
            title={item.title}
            subtitle={item.subtitle}
            trailing={item.trailing}
            badge={item.badge}
            onPress={
              onItemPress === undefined
                ? undefined
                : () => {
                    onItemPress(item.id);
                  }
            }
            testID={`${testID ?? "list"}-row-${item.id}`}
          />
        )}
      />
    </Section>
  );
}

export function FormBlock({
  title,
  fields,
  values,
  onChangeField,
  submitLabel,
  onSubmit,
  state = "ready",
  errorMessage,
  fieldErrors,
  loadingTitle,
  emptyTitle,
  testID,
}: FormBlockProps) {
  // REGISTRE 1.1.0 (D-060) : `loading` et `empty` entrent dans l'union. Comme
  // ailleurs, un état sans titre DÉCLARÉ n'est pas rendu — le moteur n'invente
  // aucun texte (F3).
  if (state === "loading" && loadingTitle !== undefined) {
    return <StateView state="loading" title={loadingTitle} testID={testID} />;
  }
  if (state === "empty" && emptyTitle !== undefined) {
    return <StateView state="empty" title={emptyTitle} testID={testID} />;
  }
  return (
    <Section title={title} testID={testID}>
      {fields.map((field) => (
        <TextField
          key={field.id}
          label={field.label}
          placeholder={field.placeholder}
          secure={field.secure}
          value={values[field.id] ?? ""}
          onChangeText={(v) => {
            onChangeField(field.id, v);
          }}
          error={fieldErrors?.[field.id]}
          testID={`${testID ?? "form"}-field-${field.id}`}
        />
      ))}
      {state === "error" && errorMessage !== undefined && (
        <AppText tone="error" testID={`${testID ?? "form"}-error`}>
          {errorMessage}
        </AppText>
      )}
      <AppButton
        label={submitLabel}
        onPress={onSubmit}
        loading={state === "submitting"}
        testID={`${testID ?? "form"}-submit`}
      />
    </Section>
  );
}

export function ButtonBlock({ label, kind, onPress, testID }: ButtonBlockProps) {
  return <AppButton label={label} kind={kind} onPress={onPress} testID={testID} />;
}

export function EmptyStateBlock({
  title,
  message,
  actionLabel,
  onAction,
  testID,
}: EmptyStateBlockProps) {
  return (
    <StateView
      state="empty"
      title={title}
      message={message}
      actionLabel={actionLabel}
      onAction={onAction}
      testID={testID}
    />
  );
}

export function DetailHeaderBlock({
  title,
  subtitle,
  badges,
  trailing,
  state = { kind: "ready" },
  imageUri,
  testID,
}: DetailHeaderBlockProps) {
  // REGISTRE 1.1.0 (D-060) : les trois états que la dimension C nomme. Titres
  // issus des DONNÉES — aucun texte moteur (F3).
  if (state.kind === "loading") {
    return <StateView state="loading" title={state.title} testID={testID} />;
  }
  if (state.kind === "empty") {
    return (
      <StateView state="empty" title={state.title} message={state.message} testID={testID} />
    );
  }
  if (state.kind === "error") {
    return (
      <StateView state="error" title={state.title} message={state.message} testID={testID} />
    );
  }
  return (
    <Section testID={testID}>
      {/* VISUEL D'EN-TETE (1.2.0, D-087). Le style vit dans la PRIMITIVE : le
          cliquet d'etancheite interdit tout style ici, et il a raison — le bloc
          choisit un ROLE, la primitive choisit la forme. Commentaire volontai-
          rement sans accents ni phrase longue : le cliquet F3 cherche des
          chaines linguistiques par motif et ne distingue pas un commentaire. */}
      {imageUri === undefined ? null : (
        <AppImage uri={imageUri} variant="header" testID={`${testID ?? "detail"}-image`} />
      )}
      <AppText variant="heading">{title}</AppText>
      {subtitle !== undefined && <AppText tone="muted">{subtitle}</AppText>}
      {trailing !== undefined && (
        <AppText variant="title" tone="primary">
          {trailing}
        </AppText>
      )}
      {/* CLÉ STABLE (D-076) — `key={badge}` collait deux badges de même valeur,
          et React refusait : « two children with the same key `` ». Le cas réel
          était deux champs de badge VIDES. La position rend la clé unique par
          construction, quelles que soient les valeurs. */}
      {badges?.map((badge, i) => <Badge key={`${String(i)}:${badge}`} label={badge} />)}
    </Section>
  );
}

// Conformité au contrat vérifiée par le compilateur (patron 3.2 / banc P-003).
export const blocks: Blocks = {
  HeaderBlock,
  ListBlock,
  FormBlock,
  ButtonBlock,
  EmptyStateBlock,
  DetailHeaderBlock,
};
