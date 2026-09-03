// V4 B-NAV — GÉNÉRATEUR candidat B : expo-router (file-based).
// AIR navigation → app/_layout.tsx + app/index.tsx (écran d'entrée) +
// app/<screenId>.tsx + nav.data.ts. Les FICHIERS générés SONT les routes.
// Sortie : manifeste Merkle sur stdout ; écriture disque si --write <dir>.
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

// Chemin de route : l'écran d'entrée devient index (contrainte expo-router).
const routePath = (screenId) =>
  screenId === nav.entryScreenId ? "index" : screenId;

for (const r of nav.routes) {
  files.set(
    `app/${routePath(r.screenId)}.tsx`,
    emitScreen(nav, r.screenId, {
      imports: ['import { router } from "expo-router";'],
      hookLine: null,
      navigateExpr: (screenId) => `router.push("/${routePath(screenId)}")`,
    }),
  );
}

const screenLines = nav.routes.flatMap((r) => [
  `      <Stack.Screen name="${routePath(r.screenId)}"`,
  `        options={{ title: navData.routes.find((x) => x.screenId === "${r.screenId}")!.title }} />`,
]);
files.set(
  "app/_layout.tsx",
  [
    "// GÉNÉRÉ — NE PAS ÉDITER (navigation, V4 B-NAV candidat expo-router)",
    'import { Stack } from "expo-router";',
    'import { navData } from "../nav.data";',
    "",
    "export default function Layout() {",
    "  return (",
    "    <Stack>",
    ...screenLines,
    "    </Stack>",
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
  JSON.stringify({ candidate: "expo-router", fileCount: files.size, root: merkle(files) }) + "\n",
);
