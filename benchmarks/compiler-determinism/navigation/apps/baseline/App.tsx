// V4 B-NAV — BASELINE sans bibliothèque de navigation (référence de poids).
import { Text, View } from "react-native";

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text testID="baseline">baseline</Text>
    </View>
  );
}
