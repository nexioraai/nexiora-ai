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
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenShell } from "../lib/primitives";
import { AirForm, AirHeader } from "../lib/runtime/air-runtime";
import { screenData } from "./scr_form.data";

export default function ScrFormScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScreenShell testID="scr_form" title={screenData.title}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom }}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <AirHeader screen={screenData} blockId="blk_form_header" />
        <AirForm screen={screenData} blockId="blk_form_client" />
      </ScrollView>
    </ScreenShell>
  );
}
