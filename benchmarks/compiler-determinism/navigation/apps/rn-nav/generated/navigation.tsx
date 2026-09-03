// GÉNÉRÉ — NE PAS ÉDITER (navigation, V4 B-NAV candidat react-navigation)
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { navData } from "./nav.data";
import ScrCommandesScreen from "./screens/scr_commandes";
import ScrMenuScreen from "./screens/scr_menu";
import ScrPanierScreen from "./screens/scr_panier";
import ScrPlatDetailScreen from "./screens/scr_plat_detail";

const Stack = createNativeStackNavigator();

export function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="scr_menu">
      <Stack.Screen name="scr_commandes" component={ScrCommandesScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_commandes")!.title }} />
      <Stack.Screen name="scr_menu" component={ScrMenuScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_menu")!.title }} />
      <Stack.Screen name="scr_panier" component={ScrPanierScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_panier")!.title }} />
      <Stack.Screen name="scr_plat_detail" component={ScrPlatDetailScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_plat_detail")!.title }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
