// COQUILLE DU HARNAIS — navigation locale + contrôles thème/RTL + états
// observables (testID) pour les assertions Maestro. Patron de la fixture
// P-003 (RECOPIÉ, la fixture gelée n'est pas touchée).
import { useState } from "react";
import { I18nManager, Text, View } from "react-native";
import { useThemeBridge } from "@deribfy/primitives";
import { EcranAuth, EcranEtats, EcranForm, EcranListDetail, EcranProfile } from "./screens";

type Ecran = "auth" | "listdetail" | "form" | "profile" | "etats";

const ECRANS: Record<Ecran, () => React.JSX.Element> = {
  auth: EcranAuth,
  listdetail: EcranListDetail,
  form: EcranForm,
  profile: EcranProfile,
  etats: EcranEtats,
};

const barre = {
  flexDirection: "row",
  justifyContent: "space-around",
  paddingVertical: 6,
} as const;

export function HarnessShell() {
  const [ecran, setEcran] = useState<Ecran>("auth");
  const { scheme, setScheme } = useThemeBridge();
  const Actif = ECRANS[ecran];
  return (
    <View style={{ flex: 1, paddingTop: 48 }}>
      {/* sonde RTL (patron du banc) + états observables */}
      <View style={{ flexDirection: "row", padding: 4 }} testID="rtl-probe">
        <Text>◀ début</Text>
        <View style={{ flex: 1 }} />
        <Text>fin ▶</Text>
      </View>
      <Text style={{ fontSize: 11, paddingHorizontal: 4 }} testID="scheme-state">
        {`thème : ${scheme}`}
      </Text>
      <Text style={{ fontSize: 11, paddingHorizontal: 4 }} testID="rtl-state">
        {`RTL : ${I18nManager.isRTL ? "ACTIF" : "inactif"}`}
      </Text>
      <View style={{ flex: 1 }}>
        <Actif />
      </View>
      <View style={barre}>
        <Text testID="toggle-theme" onPress={() => setScheme(scheme === "light" ? "dark" : "light")}>
          Thème
        </Text>
        <Text
          testID="toggle-rtl"
          onPress={() => {
            I18nManager.allowRTL(true);
            I18nManager.forceRTL(!I18nManager.isRTL);
          }}
        >
          RTL
        </Text>
      </View>
      <View style={barre}>
        <Text testID="nav-auth" onPress={() => setEcran("auth")}>Auth</Text>
        <Text testID="nav-listdetail" onPress={() => setEcran("listdetail")}>Liste</Text>
        <Text testID="nav-form" onPress={() => setEcran("form")}>Form</Text>
        <Text testID="nav-profile" onPress={() => setEcran("profile")}>Profil</Text>
        <Text testID="nav-etats" onPress={() => setEcran("etats")}>États</Text>
      </View>
    </View>
  );
}
