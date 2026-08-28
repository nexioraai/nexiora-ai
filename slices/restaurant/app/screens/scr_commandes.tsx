// GÉNÉRÉ — NE PAS ÉDITER (code structurel d'écran : ScreenShell + blocs,
// contrainte 3.4 ; les points d'insertion de Code Slots arrivent en Phase 9).
// Page DÉFILANTE (lecture D-031-R47 : le bloc list gelé n'est pas
// bornable sans toucher au gel — défaut de composition DÉMONTRÉ sur
// device : blocs post-liste hors écran ; réserve : virtualisation
// interne neutralisée, revisité au scorecard Phase 8).
import { ScrollView } from "react-native";
import { ScreenShell } from "../lib/primitives";
import { AirButton, AirEmptyState, AirHeader, AirList } from "../lib/runtime/air-runtime";
import { screenData } from "./scr_commandes.data";

export default function ScrCommandesScreen() {
  return (
    <ScreenShell testID="scr_commandes" title={screenData.title}>
      <ScrollView>
        <AirHeader screen={screenData} blockId="blk_commandes_header" />
        <AirList screen={screenData} blockId="blk_commandes_liste" />
        <AirButton screen={screenData} blockId="blk_commandes_bouton_notifications" />
        <AirButton screen={screenData} blockId="blk_commandes_bouton_annuler" />
        <AirEmptyState screen={screenData} blockId="blk_commandes_vide" />
      </ScrollView>
    </ScreenShell>
  );
}
