// GÉNÉRÉ — NE PAS ÉDITER (code structurel d'écran : ScreenShell + blocs,
// contrainte 3.4 ; les points d'insertion de Code Slots arrivent en Phase 9).
// Page DÉFILANTE (lecture D-031-R47 : le bloc list gelé n'est pas
// bornable sans toucher au gel — défaut de composition DÉMONTRÉ sur
// device : blocs post-liste hors écran ; réserve : virtualisation
// interne neutralisée, revisité au scorecard Phase 8).
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
import { AirButton, AirHeader, AirList } from "../lib/runtime/air-runtime";
import { screenData } from "./scr_menu.data";

export default function ScrMenuScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScreenShell testID="scr_menu" title={screenData.title}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom }}>
        <AirHeader screen={screenData} blockId="blk_menu_header" />
        <AirList screen={screenData} blockId="blk_menu_liste" />
        <AirButton screen={screenData} blockId="blk_menu_bouton_panier" />
        <AirButton screen={screenData} blockId="blk_menu_bouton_commandes" />
      </ScrollView>
    </ScreenShell>
  );
}
