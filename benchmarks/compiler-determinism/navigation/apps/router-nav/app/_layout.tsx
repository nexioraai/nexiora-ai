// GÉNÉRÉ — NE PAS ÉDITER (navigation, V4 B-NAV candidat expo-router)
import { Stack } from "expo-router";
import { navData } from "../nav.data";

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen name="scr_commandes"
        options={{ title: navData.routes.find((x) => x.screenId === "scr_commandes")!.title }} />
      <Stack.Screen name="index"
        options={{ title: navData.routes.find((x) => x.screenId === "scr_menu")!.title }} />
      <Stack.Screen name="scr_panier"
        options={{ title: navData.routes.find((x) => x.screenId === "scr_panier")!.title }} />
      <Stack.Screen name="scr_plat_detail"
        options={{ title: navData.routes.find((x) => x.screenId === "scr_plat_detail")!.title }} />
    </Stack>
  );
}
