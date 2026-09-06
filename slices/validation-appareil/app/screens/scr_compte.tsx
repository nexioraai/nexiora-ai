// GÉNÉRÉ — NE PAS ÉDITER (code structurel d'écran : ScreenShell + blocs,
// contrainte 3.4 ; les points d'insertion de Code Slots arrivent en Phase 9).
// DÉFILEMENT (D-031-R47 puis DET-006/D-039) : un écran SANS bloc list
// reste une page défilante ; un écran AVEC bloc list confie le
// défilement à la liste virtualisée elle-même, bornée par Section fill.
// SAFE AREA DU BAS (D-037) : défaut DÉMONTRÉ sur appareil physique
// (Galaxy A17 / Android 16) — la fenêtre est bord à bord, donc le
// DERNIER bloc était rendu sous la barre de navigation gestuelle et
// restait inatteignable. Le contenu défilant est décalé de l'inset bas
// réel. `useSafeAreaInsets` est disponible sans SafeAreaProvider ajouté :
// NativeStackView enveloppe déjà ses écrans dans SafeAreaProviderCompat
// [vérifié dans le paquet installé].
import { KeyboardAvoidingView, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenShell } from "../lib/primitives";
import { AirButton, AirEmptyState, AirForm, AirHeader } from "../lib/runtime/air-runtime";
import { PrimaryNav } from "../lib/runtime/primary-nav";
import { primaryNav } from "../nav.data";
import type { AirScreenProps } from "../lib/runtime/air-runtime";
import { screenData } from "./scr_compte.data";

export default function ScrCompteScreen({ route }: AirScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <ScreenShell testID="scr_compte" title={screenData.title}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <AirHeader screen={screenData} blockId="blk_compte_header" />
        <AirEmptyState screen={screenData} blockId="blk_compte_visiteur" />
        <AirForm screen={screenData} blockId="blk_compte_form" itemId={route?.params?.itemId} />
        <AirButton screen={screenData} blockId="blk_compte_parametres" />
        <AirButton screen={screenData} blockId="blk_compte_deconnexion" />
      </ScrollView>
      </KeyboardAvoidingView>
      <PrimaryNav destinations={primaryNav} currentScreenId="scr_compte" />
    </ScreenShell>
  );
}
