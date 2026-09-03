// GÉNÉRÉ — NE PAS ÉDITER (navigation : verdict S1 D-026 — native-stack,
// config EXPLICITE émise depuis l'AIR, patron prouvé au banc V4).
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { navData } from "./nav.data";
import ScrCommandeSuiviScreen from "./screens/scr_commande_suivi";
import ScrCommandesScreen from "./screens/scr_commandes";
import ScrCompteScreen from "./screens/scr_compte";
import ScrMenuScreen from "./screens/scr_menu";
import ScrPaiementScreen from "./screens/scr_paiement";
import ScrPanierScreen from "./screens/scr_panier";
import ScrPlatDetailScreen from "./screens/scr_plat_detail";

const Stack = createNativeStackNavigator();

export function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="scr_menu">
      <Stack.Screen name="scr_commande_suivi" component={ScrCommandeSuiviScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_commande_suivi")!.title }} />
      <Stack.Screen name="scr_commandes" component={ScrCommandesScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_commandes")!.title }} />
      <Stack.Screen name="scr_compte" component={ScrCompteScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_compte")!.title }} />
      <Stack.Screen name="scr_menu" component={ScrMenuScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_menu")!.title }} />
      <Stack.Screen name="scr_paiement" component={ScrPaiementScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_paiement")!.title }} />
      <Stack.Screen name="scr_panier" component={ScrPanierScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_panier")!.title }} />
      <Stack.Screen name="scr_plat_detail" component={ScrPlatDetailScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_plat_detail")!.title }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
