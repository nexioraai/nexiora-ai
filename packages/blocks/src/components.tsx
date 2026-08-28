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
  TextField,
} from "@deribfy/primitives";
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
  onItemPress,
  testID,
}: ListBlockProps) {
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
      <StateView
        state="error"
        title={state.title}
        message={state.message}
        actionLabel={state.retryLabel}
        onAction={state.onRetry}
        testID={testID}
      />
    );
  }
  return (
    <Section title={title} testID={testID}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ListRow
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
  testID,
}: FormBlockProps) {
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
  testID,
}: DetailHeaderBlockProps) {
  return (
    <Section testID={testID}>
      <AppText variant="heading">{title}</AppText>
      {subtitle !== undefined && <AppText tone="muted">{subtitle}</AppText>}
      {trailing !== undefined && (
        <AppText variant="title" tone="primary">
          {trailing}
        </AppText>
      )}
      {badges?.map((badge) => <Badge key={badge} label={badge} />)}
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
