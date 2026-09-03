// P-003 — LES 3 ÉCRANS DU PROTOCOLE, candidat-AGNOSTIQUES : ils n'importent
// QUE les contrats partagés et React/React Native. Aucun import de
// bibliothèque de styling ici (étanchéité contractuelle).
import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { FlatList, I18nManager, Text, View } from "react-native";
import type { CardData, Primitives } from "./contracts";
import { CARDS } from "./data";

export interface ListScreenHandle {
  scrollToEnd: () => void;
  scrollToTop: () => void;
}

export const makeListScreen = (P: Primitives) =>
  forwardRef<ListScreenHandle, { onFirstLayout: () => void }>(
    function ListScreen({ onFirstLayout }, ref) {
      const list = useRef<FlatList<CardData>>(null);
      const fired = useRef(false);
      useImperativeHandle(ref, () => ({
        scrollToEnd: () => list.current?.scrollToEnd({ animated: true }),
        scrollToTop: () => list.current?.scrollToOffset({ offset: 0, animated: false }),
      }));
      return (
        <P.ScreenShell title="Catalogue (500)">
          <FlatList
            ref={list}
            testID="bench-list"
            data={CARDS}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => <P.Card item={item} index={index} />}
            onLayout={() => {
              if (!fired.current) {
                fired.current = true;
                onFirstLayout();
              }
            }}
          />
        </P.ScreenShell>
      );
    },
  );

const FIELDS = [
  { key: "nom", label: "Nom du commerce", placeholder: "Chez Awa" },
  { key: "email", label: "Email", placeholder: "contact@exemple.com" },
  { key: "tel", label: "Téléphone", placeholder: "+225 07 00 00 00" },
  { key: "adresse", label: "Adresse", placeholder: "Rue des Jardins, Cocody" },
  { key: "ville", label: "Ville", placeholder: "Abidjan" },
  { key: "siret", label: "Identifiant fiscal", placeholder: "CI-123456" },
  { key: "iban", label: "IBAN", placeholder: "CI93 XXXX…" },
  { key: "note", label: "Note interne", placeholder: "Livraison le matin" },
] as const;

export const makeFormScreen = (P: Primitives) =>
  function FormScreen() {
    const [values, setValues] = useState<Record<string, string>>({});
    return (
      <P.ScreenShell title="Inscription commerçant">
        <P.Section title="8 champs · états error/loading">
          {FIELDS.map((field, i) => (
            <P.TextField
              key={field.key}
              label={field.label}
              placeholder={field.placeholder}
              value={values[field.key] ?? ""}
              onChangeText={(v) => setValues((s) => ({ ...s, [field.key]: v }))}
              error={i === 1 ? "Format invalide" : i === 6 ? "IBAN inconnu" : undefined}
              loading={i === 5}
            />
          ))}
          <P.AppButton label="Enregistrer" onPress={() => {}} testID="form-submit" />
        </P.Section>
      </P.ScreenShell>
    );
  };

export const makeThemeScreen = (P: Primitives) =>
  function ThemeScreen(props: {
    scheme: string;
    onToggleScheme: () => void;
    onToggleRtl: () => void;
  }) {
    return (
      <P.ScreenShell title="Thème & RTL">
        <P.Section title={`Schéma actuel : ${props.scheme}`}>
          <P.AppButton label="Basculer light/dark" onPress={props.onToggleScheme} testID="toggle-theme" />
          <P.Badge label="info" tone="info" />
          <P.Badge label="succès" tone="success" />
          <P.Badge label="attention" tone="warn" />
        </P.Section>
        <P.Section title={`RTL : ${I18nManager.isRTL ? "ACTIF" : "inactif"} (redémarrage requis)`}>
          <P.AppButton label="Basculer RTL puis quitter" onPress={props.onToggleRtl} kind="ghost" testID="toggle-rtl" />
          <P.Card item={CARDS[0]} index={0} />
          <P.Card item={CARDS[1]} index={1} />
        </P.Section>
      </P.ScreenShell>
    );
  };

// Témoin de miroir RTL sans style candidat (View/Text nus) — sert de
// référence de capture.
export function RtlProbe() {
  return (
    <View style={{ flexDirection: "row", padding: 8 }} testID="rtl-probe">
      <Text>◀ début</Text>
      <View style={{ flex: 1 }} />
      <Text>fin ▶</Text>
    </View>
  );
}
