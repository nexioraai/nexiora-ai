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
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenShell } from "../lib/primitives";
import { AirButton, AirEmptyState, AirForm, AirHeader, AirList, AirScreenLifecycle } from "../lib/runtime/air-runtime";
import { screenData } from "./scr_panier.data";

export default function ScrPanierScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScreenShell testID="scr_panier" title={screenData.title}>
      <AirScreenLifecycle screen={screenData} />
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        <AirHeader screen={screenData} blockId="blk_panier_header" />
        <AirList screen={screenData} blockId="blk_panier_liste" />
        <AirEmptyState screen={screenData} blockId="blk_panier_etat_vide" />
        <AirHeader screen={screenData} blockId="blk_panier_total" />
        <AirHeader screen={screenData} blockId="blk_panier_delai" />
        <AirForm screen={screenData} blockId="blk_panier_form_commande" />
        <AirButton screen={screenData} blockId="blk_panier_btn_valider" />
        <AirButton screen={screenData} blockId="blk_panier_btn_retour" />
      </View>
    </ScreenShell>
  );
}
