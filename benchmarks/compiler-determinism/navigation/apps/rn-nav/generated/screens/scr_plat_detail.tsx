// GÉNÉRÉ — NE PAS ÉDITER (écran de banc, V4 B-NAV)
import { Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { navData } from "../nav.data";

export default function ScrPlatDetailScreen() {
  const navigation = useNavigation();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
      <Text testID="scr_plat_detail">{navData.routes.find((r) => r.screenId === "scr_plat_detail")!.title}</Text>
      <Pressable testID="nav_to_scr_commandes" onPress={() => navigation.navigate("scr_commandes" as never)}>
        <Text>{navData.routes.find((r) => r.screenId === "scr_commandes")!.title}</Text>
      </Pressable>
      <Pressable testID="nav_to_scr_menu" onPress={() => navigation.navigate("scr_menu" as never)}>
        <Text>{navData.routes.find((r) => r.screenId === "scr_menu")!.title}</Text>
      </Pressable>
      <Pressable testID="nav_to_scr_panier" onPress={() => navigation.navigate("scr_panier" as never)}>
        <Text>{navData.routes.find((r) => r.screenId === "scr_panier")!.title}</Text>
      </Pressable>
    </View>
  );
}
