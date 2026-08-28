// GÉNÉRÉ — NE PAS ÉDITER (écran de banc, V4 B-NAV)
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { navData } from "../nav.data";

export default function ScrMenuScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
      <Text testID="scr_menu">{navData.routes.find((r) => r.screenId === "scr_menu")!.title}</Text>
      <Pressable testID="nav_to_scr_commandes" onPress={() => router.push("/scr_commandes")}>
        <Text>{navData.routes.find((r) => r.screenId === "scr_commandes")!.title}</Text>
      </Pressable>
      <Pressable testID="nav_to_scr_panier" onPress={() => router.push("/scr_panier")}>
        <Text>{navData.routes.find((r) => r.screenId === "scr_panier")!.title}</Text>
      </Pressable>
      <Pressable testID="nav_to_scr_plat_detail" onPress={() => router.push("/scr_plat_detail")}>
        <Text>{navData.routes.find((r) => r.screenId === "scr_plat_detail")!.title}</Text>
      </Pressable>
    </View>
  );
}
