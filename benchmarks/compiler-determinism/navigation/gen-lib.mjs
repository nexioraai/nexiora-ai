// V4 B-NAV (4.0, D-026) — bibliothèque PARTAGÉE des deux générateurs.
// Candidat-NEUTRE : chargement de l'AIR, résolution des titres à la locale
// par défaut, émission des écrans (identiques pour les deux candidats à
// l'expression de navigation près) et manifeste Merkle. Les règles
// d'émission sont celles de V2 (S5) : LF, UTF-8 sans BOM, tri par point de
// code, identifiants validés par regex, matière variable en module
// canonique (Option C).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
export const { canonicalJson, sha256Hex } = await import(
  join(REPO, "packages/air-schema/src/canonical.ts")
);

export const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const ID_RE = /^[a-z][a-z0-9_]*$/;
export const assertId = (s) => {
  if (!ID_RE.test(s)) throw new Error(`identifiant non conforme: ${s}`);
  return s;
};

export function loadFixture() {
  const doc = JSON.parse(
    readFileSync(
      join(REPO, "packages/golden-corpus/corpus-v2/resto-quartier.air.json"),
      "utf8",
    ),
  );
  const locale = doc.app.locales.defaultAppLocale;
  const resolveTitle = (title) => {
    const hit =
      title.find((t) => t.locale === locale) ??
      title.find((t) => t.locale.startsWith(locale.split("-")[0]));
    if (!hit) throw new Error("titre introuvable à la locale par défaut");
    return hit.text;
  };
  const routes = [...doc.navigation.routes]
    .sort((a, b) => byCodeUnit(a.screenId, b.screenId))
    .map((r) => ({
      routeId: assertId(r.id),
      screenId: assertId(r.screenId),
      title: resolveTitle(r.title),
    }));
  return {
    entryScreenId: assertId(doc.navigation.entryScreenId),
    locale,
    routes,
  };
}

// Module de données canonique (Option C) — commun aux deux candidats.
export function emitNavData(nav) {
  return (
    "// GÉNÉRÉ — NE PAS ÉDITER (données canoniques, V4 B-NAV)\n" +
    `export const navData = ${canonicalJson(nav)} as const;\n`
  );
}

// Écran de banc : titre assertable + un bouton par AUTRE route.
// `navigateExpr(screenId)` est la SEULE différence entre candidats.
export function emitScreen(nav, screenId, { imports, navigateExpr, hookLine }) {
  const others = nav.routes.filter((r) => r.screenId !== screenId);
  const name = screenId
    .split("_")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join("");
  const lines = [
    "// GÉNÉRÉ — NE PAS ÉDITER (écran de banc, V4 B-NAV)",
    'import { Pressable, Text, View } from "react-native";',
    ...imports,
    'import { navData } from "../nav.data";',
    "",
    `export default function ${name}Screen() {`,
    ...(hookLine ? [`  ${hookLine}`] : []),
    "  return (",
    '    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>',
    `      <Text testID="${screenId}">{navData.routes.find((r) => r.screenId === "${screenId}")!.title}</Text>`,
    ...others.flatMap((r) => [
      `      <Pressable testID="nav_to_${r.screenId}" onPress={() => ${navigateExpr(r.screenId)}}>`,
      `        <Text>{navData.routes.find((r) => r.screenId === "${r.screenId}")!.title}</Text>`,
      "      </Pressable>",
    ]),
    "    </View>",
    "  );",
    "}",
    "",
  ];
  return lines.join("\n");
}

export function merkle(files) {
  const entries = [...files.keys()].sort(byCodeUnit).map((path) => ({
    path,
    sha256: sha256Hex(files.get(path)),
  }));
  return sha256Hex(canonicalJson({ entries, merkleVersion: "1" }));
}
