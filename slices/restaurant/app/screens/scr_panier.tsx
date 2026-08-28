// GÉNÉRÉ — NE PAS ÉDITER (code structurel d'écran : ScreenShell + blocs,
// contrainte 3.4 ; les points d'insertion de Code Slots arrivent en Phase 9).
// Page DÉFILANTE (lecture D-031-R47 : le bloc list gelé n'est pas
// bornable sans toucher au gel — défaut de composition DÉMONTRÉ sur
// device : blocs post-liste hors écran ; réserve : virtualisation
// interne neutralisée, revisité au scorecard Phase 8).
import { ScrollView } from "react-native";
import { ScreenShell } from "../lib/primitives";
import { AirButton, AirEmptyState, AirForm, AirHeader, AirList } from "../lib/runtime/air-runtime";
import { screenData } from "./scr_panier.data";

export default function ScrPanierScreen() {
  return (
    <ScreenShell testID="scr_panier" title={screenData.title}>
      <ScrollView>
        <AirHeader screen={screenData} blockId="blk_panier_header" />
        <AirList screen={screenData} blockId="blk_panier_lignes" />
        <AirEmptyState screen={screenData} blockId="blk_panier_vide" />
        <AirForm screen={screenData} blockId="blk_panier_formulaire" />
        <AirButton screen={screenData} blockId="blk_panier_bouton_payer" />
      </ScrollView>
    </ScreenShell>
  );
}
