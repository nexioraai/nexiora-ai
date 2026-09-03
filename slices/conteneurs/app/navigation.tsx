// GÉNÉRÉ — NE PAS ÉDITER (navigation : verdict S1 D-026 — native-stack,
// config EXPLICITE émise depuis l'AIR, patron prouvé au banc V4).
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { navData } from "./nav.data";
import ScrConteneurDetailScreen from "./screens/scr_conteneur_detail";
import ScrConteneursScreen from "./screens/scr_conteneurs";
import ScrNotificationsScreen from "./screens/scr_notifications";
import ScrSuiviAjoutScreen from "./screens/scr_suivi_ajout";

const Stack = createNativeStackNavigator();

export function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="scr_conteneurs">
      <Stack.Screen name="scr_conteneur_detail" component={ScrConteneurDetailScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_conteneur_detail")!.title }} />
      <Stack.Screen name="scr_conteneurs" component={ScrConteneursScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_conteneurs")!.title }} />
      <Stack.Screen name="scr_notifications" component={ScrNotificationsScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_notifications")!.title }} />
      <Stack.Screen name="scr_suivi_ajout" component={ScrSuiviAjoutScreen}
        options={{ title: navData.routes.find((x) => x.screenId === "scr_suivi_ajout")!.title }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
