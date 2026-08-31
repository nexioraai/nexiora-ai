// GÉNÉRÉ — NE PAS ÉDITER (navigation : verdict S1 D-026 — native-stack,
// config EXPLICITE émise depuis l'AIR, patron prouvé au banc V4).
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { navData } from "./nav.data";
import ScrCommandeScreen from "./screens/scr_commande";
import ScrCommandesScreen from "./screens/scr_commandes";
import ScrConfirmationScreen from "./screens/scr_confirmation";
import ScrFormScreen from "./screens/scr_form";
import ScrMenuScreen from "./screens/scr_menu";
import ScrPanierScreen from "./screens/scr_panier";
import ScrPlatScreen from "./screens/scr_plat";

const Stack = createNativeStackNavigator();

export function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="scr_menu">
      <Stack.Screen name="scr_commande" component={ScrCommandeScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_commande")!.title }} />
      <Stack.Screen name="scr_commandes" component={ScrCommandesScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_commandes")!.title }} />
      <Stack.Screen name="scr_confirmation" component={ScrConfirmationScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_confirmation")!.title }} />
      <Stack.Screen name="scr_form" component={ScrFormScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_form")!.title }} />
      <Stack.Screen name="scr_menu" component={ScrMenuScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_menu")!.title }} />
      <Stack.Screen name="scr_panier" component={ScrPanierScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_panier")!.title }} />
      <Stack.Screen name="scr_plat" component={ScrPlatScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_plat")!.title }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
