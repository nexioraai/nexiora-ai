// V4 B-NAV — GÉNÉRATEUR candidat A : @react-navigation/native-stack.
// AIR navigation → generated/nav.data.ts + generated/navigation.tsx +
// generated/screens/<screenId>.tsx. Sortie : manifeste Merkle sur stdout ;
// écriture disque uniquement si --write <dir>.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emitNavData,
  emitScreen,
  loadFixture,
  merkle,
} from "./gen-lib.mjs";

const nav = loadFixture();
const files = new Map();
files.set("nav.data.ts", emitNavData(nav));

for (const r of nav.routes) {
  files.set(
    `screens/${r.screenId}.tsx`,
    emitScreen(nav, r.screenId, {
      imports: ['import { useNavigation } from "@react-navigation/native";'],
      hookLine: "const navigation = useNavigation();",
      navigateExpr: (screenId) =>
        `navigation.navigate("${screenId}" as never)`,
    }),
  );
}

const screenLines = nav.routes.flatMap((r) => {
  const name = r.screenId
    .split("_")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join("");
  return [
    `      <Stack.Screen name="${r.screenId}" component={${name}Screen}`,
    `        options={{ title: navData.routes.find((x) => x.screenId === "${r.screenId}")!.title }} />`,
  ];
});
const importLines = nav.routes.map((r) => {
  const name = r.screenId
    .split("_")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join("");
  return `import ${name}Screen from "./screens/${r.screenId}";`;
});
files.set(
  "navigation.tsx",
  [
    "// GÉNÉRÉ — NE PAS ÉDITER (navigation, V4 B-NAV candidat react-navigation)",
    'import { NavigationContainer } from "@react-navigation/native";',
    'import { createNativeStackNavigator } from "@react-navigation/native-stack";',
    'import { navData } from "./nav.data";',
    ...importLines,
    "",
    "const Stack = createNativeStackNavigator();",
    "",
    "export function Navigation() {",
    "  return (",
    "    <NavigationContainer>",
    `      <Stack.Navigator initialRouteName="${nav.entryScreenId}">`,
    ...screenLines,
    "      </Stack.Navigator>",
    "    </NavigationContainer>",
    "  );",
    "}",
    "",
  ].join("\n"),
);

const writeIdx = process.argv.indexOf("--write");
if (writeIdx !== -1) {
  const out = process.argv[writeIdx + 1];
  for (const [path, content] of files) {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), content);
  }
}
process.stdout.write(
  JSON.stringify({ candidate: "react-navigation", fileCount: files.size, root: merkle(files) }) + "\n",
);
