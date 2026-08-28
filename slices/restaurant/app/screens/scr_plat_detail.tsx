// GÉNÉRÉ — NE PAS ÉDITER (code structurel d'écran : ScreenShell + blocs,
// contrainte 3.4 ; les points d'insertion de Code Slots arrivent en Phase 9).
// Page DÉFILANTE (lecture D-031-R47 : le bloc list gelé n'est pas
// bornable sans toucher au gel — défaut de composition DÉMONTRÉ sur
// device : blocs post-liste hors écran ; réserve : virtualisation
// interne neutralisée, revisité au scorecard Phase 8).
import { ScrollView } from "react-native";
import { ScreenShell } from "../lib/primitives";
import { AirButton, AirDetailHeader } from "../lib/runtime/air-runtime";
import type { AirScreenProps } from "../lib/runtime/air-runtime";
import { screenData } from "./scr_plat_detail.data";

export default function ScrPlatDetailScreen({ route }: AirScreenProps) {
  return (
    <ScreenShell testID="scr_plat_detail" title={screenData.title}>
      <ScrollView>
        <AirDetailHeader screen={screenData} blockId="blk_plat_detail_header" itemId={route?.params?.itemId} />
        <AirButton screen={screenData} blockId="blk_plat_bouton_ajouter" />
        <AirButton screen={screenData} blockId="blk_plat_bouton_retour_menu" />
      </ScrollView>
    </ScreenShell>
  );
}
