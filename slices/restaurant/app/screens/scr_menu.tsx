// GÉNÉRÉ — NE PAS ÉDITER (code structurel d'écran : ScreenShell + blocs,
// contrainte 3.4 ; les points d'insertion de Code Slots arrivent en Phase 9).
// Page DÉFILANTE (lecture D-031-R47 : le bloc list gelé n'est pas
// bornable sans toucher au gel — défaut de composition DÉMONTRÉ sur
// device : blocs post-liste hors écran ; réserve : virtualisation
// interne neutralisée, revisité au scorecard Phase 8).
import { ScrollView } from "react-native";
import { ScreenShell } from "../lib/primitives";
import { AirButton, AirHeader, AirList } from "../lib/runtime/air-runtime";
import { screenData } from "./scr_menu.data";

export default function ScrMenuScreen() {
  return (
    <ScreenShell testID="scr_menu" title={screenData.title}>
      <ScrollView>
        <AirHeader screen={screenData} blockId="blk_menu_header" />
        <AirList screen={screenData} blockId="blk_menu_liste" />
        <AirButton screen={screenData} blockId="blk_menu_bouton_panier" />
        <AirButton screen={screenData} blockId="blk_menu_bouton_commandes" />
      </ScrollView>
    </ScreenShell>
  );
}
