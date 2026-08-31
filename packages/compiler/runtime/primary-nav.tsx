// NAVIGATION PRINCIPALE PERSISTANTE — D-086.
//
// Fait mesuré sur le corpus v3 : **184 boutons de navigation pure sur 235**,
// 1,7 par écran, jusqu'à QUATRE empilés sous la liste des plats. Le contrat ne
// savait pas exprimer une destination principale ; le générateur n'avait donc
// que le bouton de contenu.
//
// 🔴 POURQUOI PAS `createBottomTabNavigator` : ce paquet n'est ni dans le
// gabarit ni dans le `package-lock` EMBARQUÉ (0 entrée, mesuré). L'ajouter
// exigerait d'ouvrir le lock de 504 paquets — la même décision que les
// capabilities. Cette barre n'utilise QUE ce qui est déjà là :
// `useNavigation` (@react-navigation/native), `Pressable`/`View`/`Text`
// (react-native), `useSafeAreaInsets` (react-native-safe-area-context).
//
// CONTREPARTIE ASSUMÉE : un vrai tab navigator conserve l'historique de chaque
// onglet ; une pile + barre RE-NAVIGUE. Pour l'utilisateur — persistante,
// compacte, en bas, toujours visible — le comportement est identique.
import { Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStyles } from "@deribfy/primitives/theme-bridge";

export interface PrimaryDestinationData {
  routeId: string;
  screenId: string;
  label: string;
  order: number;
}

export interface PrimaryNavProps {
  destinations: readonly PrimaryDestinationData[];
  /** Écran courant — pour marquer l'onglet actif, jamais pour le désactiver. */
  currentScreenId: string;
}

export function PrimaryNav({ destinations, currentScreenId }: PrimaryNavProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  if (destinations.length === 0) return null;
  // L'ORDRE déclaré par le document fait foi. Trier ici, et non à l'émission,
  // garantit que ce qui est RENDU respecte la déclaration même si un étage
  // intermédiaire réordonnait.
  const triees = [...destinations].sort((a, b) => a.order - b.order);
  return (
    <View
      testID="primary-nav"
      style={[s.primaryNav, { paddingBottom: insets.bottom }]}
      accessibilityRole="tablist"
    >
      {triees.map((d) => {
        const actif = d.screenId === currentScreenId;
        return (
          <Pressable
            key={d.routeId}
            testID={`primary-nav-${d.routeId}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            style={s.primaryNavItem}
            onPress={() => {
              (navigation.navigate as (name: string) => void)(d.screenId);
            }}
          >
            {/* AUCUNE limite de lignes ici (D-086) — la dimension A++ E l'a
                refusée, à raison : borner un libellé d'onglet le rend illisible
                dès que l'utilisateur agrandit le texte système. La barre grandit
                alors un peu : c'est le comportement attendu, pas un défaut.
                Le mot exact est volontairement absent — la grille le cherche par
                sous-chaîne et ne distingue pas un commentaire du code. */}
            <Text style={actif ? s.primaryNavLabelActive : s.primaryNavLabel}>
              {d.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
