// CAPTURE DE PREUVE APPAREIL — étapes `A12` / `A13` du protocole physique.
//
// Assemble l'artefact `deribfy.preuve-appareil/1` que la grille A++ consomme
// (`packages/oracle/src/preuve-appareil.ts`, V3 de `D-135`), à partir de
// RELEVÉS RÉELS pris sur un appareil branché : densité, insets système,
// dimensions d'écran, modèle, OS — et la hiérarchie UI brute exportée par
// Maestro (`--debug-output`, fichier `screen-hierarchy/*.json`).
//
// 🔴 CE SCRIPT NE FABRIQUE RIEN. Toute grandeur absente est une ERREUR, jamais
// une valeur par défaut. Avant d'écrire, l'artefact est soumis au LECTEUR de
// la grille : si le lecteur le refuserait, rien n'est écrit. Un artefact
// produit ici est donc, par construction, recevable ou inexistant.
//
// ⚠️ ÉMULATEUR : `adb` accepte un émulateur, la GRILLE non — elle exige une
// « mesure sur appareil réel ». Le script REFUSE les cibles `emulator-*` et
// les modèles de type `sdk_gphone*` : une preuve d'émulateur n'est pas une
// preuve d'appareil, et ce refus est mécanique, pas une consigne.
//
// USAGE
//   node capturer-preuve.mjs --serial <ID> --build <easBuildId> --sha <sha256>
//        --a12 <hierarchie.json> [--a13 <hierarchie.json> --bloc <blockId>
//        --lignes <n>] --sortie <dossier>
//   node capturer-preuve.mjs --verifier      (auto-contrôle des parseurs, 0 appareil)
//
// PRÉ-REQUIS À L'ARRIVÉE : `adb` (présent) et `maestro` (à installer :
// `curl -Ls https://get.maestro.mobile.dev | bash`). Commande de capture :
//   maestro test --debug-output <dossier> <flow.yaml>
// puis passer le fichier `screen-hierarchy/*.json` produit en `--a12` / `--a13`.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = join(fileURLToPath(import.meta.url), "..");
const R = join(ICI, "..", "..") + "/";

// ---------------------------------------------------------------- PARSEURS
// Purs, testables, et STRICTS : une sortie inattendue rend `null`, jamais une
// valeur plausible. C'est ce qui empêche un relevé manqué de passer pour un
// relevé fait.

/** `Physical density: 420` → facteur d'échelle px/dp (420/160 = 2.625). */
export function parseDensite(sortie) {
  // L'OVERRIDE prime quand il existe : c'est la densité effective. Deux
  // lectures distinctes, jamais une alternation — celle-ci retiendrait le
  // motif le plus haut dans la sortie, et `wm density` imprime « Physical »
  // en premier. Défaut trouvé par l'auto-contrôle.
  const over = /Override density:\s*(\d+)/.exec(sortie);
  const phys = /Physical density:\s*(\d+)/.exec(sortie);
  const brut = over?.[1] ?? phys?.[1];
  if (brut === undefined) return null;
  const dpi = Number.parseInt(brut, 10);
  return Number.isFinite(dpi) && dpi > 0 ? dpi / 160 : null;
}

/** `Physical size: 1080x2400` → dimensions en pixels. */
export function parseTaille(sortie) {
  // Même règle qu'en densité : l'override prime, lectures séparées.
  const over = /Override size:\s*(\d+)x(\d+)/.exec(sortie);
  const phys = /Physical size:\s*(\d+)x(\d+)/.exec(sortie);
  const m = over ?? phys;
  if (m === null) return null;
  const l = Number.parseInt(m[1], 10);
  const h = Number.parseInt(m[2], 10);
  return l > 0 && h > 0 ? { largeurPx: l, hauteurPx: h } : null;
}

/**
 * Insets système depuis `dumpsys window`. Source retenue : les `mInsetsHint`
 * des `InsetsSourceControl`, qui donnent la contribution de CHAQUE barre par
 * bord. On retient le MAXIMUM par bord — deux sources peuvent contribuer au
 * même bord, et sous-estimer un inset ferait passer une cible masquée pour
 * une cible visible.
 */
/** Seuls les DÉCORS PERMANENTS bornent la zone sûre. Voir `parseInsets`. */
const TYPES_BARRES = ["statusBars", "navigationBars"];

export function parseInsets(sortie) {
  // 🔴 DÉFAUT TROUVÉ SUR MATÉRIEL RÉEL (Galaxy A17, 2026-09-05) — la version
  // précédente prenait le MAXIMUM sur TOUS les `mInsetsHint`, sans regarder
  // leur type. Or `dumpsys window` en publie un pour le CLAVIER :
  //     ime -> bottom=1008
  // contre 135 pour la barre de navigation. Retenir 1008 aurait placé la
  // frontière basse de la zone sûre au milieu de l'écran et déclaré presque
  // toutes les cibles « sous la barre système » : un `non_conforme` MASSIF et
  // FAUX sur la dimension A. Le clavier n'est pas un décor permanent — il
  // apparaît sur saisie et disparaît ; la zone sûre se borne aux barres.
  //
  // On ne retient donc que `statusBars` et `navigationBars`, et le maximum
  // par bord ENTRE ELLES : deux barres peuvent contribuer au même bord, et
  // sous-estimer un inset ferait passer une cible masquée pour visible.
  const trouves = [...sortie.matchAll(
    /mType=([a-zA-Z]+)[^}]*mInsetsHint=Insets\{left=(\d+),\s*top=(\d+),\s*right=(\d+),\s*bottom=(\d+)\}/g,
  )].filter((m) => TYPES_BARRES.includes(m[1]));
  if (trouves.length === 0) return null;
  const max = (i) => Math.max(...trouves.map((m) => Number.parseInt(m[i], 10)));
  return { gauchePx: max(2), hautPx: max(3), droitePx: max(4), basPx: max(5) };
}

// ------------------------------------------------------------------ OUTILS
const arg = (nom) => {
  const i = process.argv.indexOf(`--${nom}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const ADB = process.env.ADB ?? join(process.env.HOME ?? "", "Library/Android/sdk/platform-tools/adb");
const adb = (serial, ...cmd) => execFileSync(ADB, ["-s", serial, ...cmd], { encoding: "utf8" });
const mourir = (msg) => {
  console.error(`🔴 ${msg}`);
  process.exit(1);
};

// -------------------------------------------------------- AUTO-CONTRÔLE
// Patron `verifier.mjs` : le script sait se vérifier lui-même, sans appareil.
// Les échantillons sont des sorties adb RÉELLES, conservées telles quelles.
if (process.argv.includes("--verifier")) {
  let echecs = 0;
  const check = (nom, ok, detail = "") => {
    console.log(`  ${ok ? "🟢" : "🔴"} ${nom}${detail ? " — " + detail : ""}`);
    if (!ok) echecs++;
  };
  console.log("\n  AUTO-CONTRÔLE DES PARSEURS (aucun appareil requis)\n");

  const d = parseDensite("Physical density: 420\n");
  check("densité : dpi → facteur d'échelle", d === 2.625, `420 dpi → ${String(d)} px/dp`);
  check("densité : override prioritaire", parseDensite("Physical density: 420\nOverride density: 480\n") === 3);
  check("densité : sortie inattendue → null", parseDensite("bla") === null);

  const t = parseTaille("Physical size: 1080x2400\n");
  check("taille : dimensions lues", t?.largeurPx === 1080 && t.hauteurPx === 2400, `${t?.largeurPx}x${t?.hauteurPx}`);
  const to = parseTaille("Physical size: 1080x2400\nOverride size: 720x1600\n");
  check("taille : override prioritaire", to?.largeurPx === 720 && to.hauteurPx === 1600, `${to?.largeurPx}x${to?.hauteurPx}`);
  check("taille : sortie inattendue → null", parseTaille("") === null);

  const ECHANTILLON = `
        InsetsSourceControl: {deba0001 mType=navigationBars initiallyVisible mSurfacePosition=Point(0, 2337) mInsetsHint=Insets{left=0, top=0, right=0, bottom=63}}
        InsetsSourceControl: {4f450000 mType=statusBars initiallyVisible mSurfacePosition=Point(0, 0) mInsetsHint=Insets{left=0, top=74, right=0, bottom=0}}`;
  const i = parseInsets(ECHANTILLON);
  check("insets : maximum par bord sur 2 sources", i?.hautPx === 74 && i.basPx === 63, `haut=${i?.hautPx} bas=${i?.basPx}`);
  check("insets : bords latéraux", i?.gauchePx === 0 && i.droitePx === 0);
  check("insets : aucune source → null", parseInsets("rien") === null);
  // ÉCHANTILLON RÉEL Galaxy A17 (2026-09-05), CLAVIER COMPRIS. Sans ce
  // contrôle, l'inset `ime` passait pour une barre système et bornait la zone
  // sûre à 1008 px — presque toutes les cibles auraient été déclarées masquées.
  const A17 = `
        InsetsSourceControl: {1 mType=ime mInsetsHint=Insets{left=0, top=0, right=0, bottom=1008}}
        InsetsSourceControl: {2 mType=navigationBars mInsetsHint=Insets{left=0, top=0, right=0, bottom=135}}
        InsetsSourceControl: {3 mType=statusBars mInsetsHint=Insets{left=0, top=100, right=0, bottom=0}}`;
  const a = parseInsets(A17);
  check("insets : le CLAVIER (ime) est EXCLU", a?.basPx === 135, `bas=${a?.basPx} (1008 = clavier, refusé)`);
  check("insets : barre haute retenue", a?.hautPx === 100);
  check("insets : aucune barre, seulement un clavier → null", parseInsets(`mType=ime mInsetsHint=Insets{left=0, top=0, right=0, bottom=900}`) === null);

  check("cible émulateur REFUSÉE (serial)", estEmulateur("emulator-5554", "Pixel 7"));
  check("cible émulateur REFUSÉE (modèle)", estEmulateur("R58N123", "sdk_gphone64_arm64"));
  check("appareil réel ACCEPTÉ", !estEmulateur("R58N123", "SM-A176B"));

  console.log(`\n${echecs === 0 ? "  🟢 PARSEURS CONFORMES" : `  🔴 ${echecs} échec(s)`}\n`);
  process.exit(echecs === 0 ? 0 : 1);
}

/** Une preuve d'émulateur n'est pas une preuve d'appareil (`D-039`, `D-135`). */
export function estEmulateur(serial, modele) {
  return /^emulator-/.test(serial) || /^sdk_gphone|^Android SDK built/.test(modele);
}

// ------------------------------------------------------------------ CAPTURE
const serial = arg("serial") ?? mourir("--serial manquant (voir `adb devices`)");
const easBuildId = arg("build") ?? mourir("--build manquant (identifiant EAS de l'artefact INSTALLÉ)");
const artefactSha256 = arg("sha") ?? mourir("--sha manquant (empreinte de l'APK/IPA installé)");
const a12 = arg("a12") ?? mourir("--a12 manquant (hiérarchie Maestro de l'écran d'accueil)");
const sortie = arg("sortie") ?? mourir("--sortie manquant (dossier de dépôt de la preuve)");
const a13 = arg("a13");
const bloc = arg("bloc");
const lignes = arg("lignes");

if (!existsSync(ADB)) mourir(`adb introuvable : ${ADB}`);
if (!existsSync(a12)) mourir(`hiérarchie A12 introuvable : ${a12}`);
if (a13 !== undefined && (bloc === undefined || lignes === undefined)) {
  mourir("--a13 exige --bloc <blockId> et --lignes <lignes SERVIES par la source>");
}

const modele = adb(serial, "shell", "getprop", "ro.product.model").trim();
const os = `Android ${adb(serial, "shell", "getprop", "ro.build.version.release").trim()}`;
if (estEmulateur(serial, modele))
  mourir(`cible « ${serial} » (${modele}) est un ÉMULATEUR. La grille exige une mesure sur APPAREIL RÉEL : refusé.`);

const densite = parseDensite(adb(serial, "shell", "wm", "density")) ?? mourir("densité illisible");
const taille = parseTaille(adb(serial, "shell", "wm", "size")) ?? mourir("dimensions d'écran illisibles");
const insets = parseInsets(adb(serial, "shell", "dumpsys", "window")) ?? mourir("insets système illisibles");

const captures = [
  { etape: "A12", ecranId: arg("ecran-a12") ?? "scr_accueil", hierarchie: JSON.parse(readFileSync(a12, "utf8")) },
];
if (a13 !== undefined) {
  captures.push({
    etape: "A13",
    ecranId: arg("ecran-a13") ?? "scr_departs",
    hierarchie: JSON.parse(readFileSync(a13, "utf8")),
    liste: { blocId: bloc, lignesServies: Number.parseInt(lignes, 10) },
  });
}

const { hashCanonical } = await import(R + "packages/air-schema/src/canonical.ts");
const { migrateAirDocument } = await import(R + "packages/air-schema/src/migrations.ts");
const air = migrateAirDocument(JSON.parse(readFileSync(join(ICI, "validation-appareil.air.json"), "utf8")));

const preuve = {
  schema: "deribfy.preuve-appareil/1",
  capturedAt: new Date().toISOString(),
  build: { easBuildId, artefactSha256, airHash: hashCanonical(air) },
  appareil: { plateforme: "android", modele, os },
  ecran: { largeurPx: taille.largeurPx, hauteurPx: taille.hauteurPx, densite },
  insets,
  captures,
};

// GARDE FINALE — l'artefact est soumis au LECTEUR de la grille avant écriture.
// S'il serait refusé, rien n'est écrit : impossible de déposer une preuve
// irrecevable et de la découvrir plus tard.
const { lirePreuveAppareil } = await import(R + "packages/oracle/src/preuve-appareil.ts");
const lecture = lirePreuveAppareil(preuve, air);
if (!lecture.recevable) mourir(`preuve REFUSÉE par le lecteur, rien n'est écrit :\n     ${lecture.motifs.join("\n     ")}`);

mkdirSync(sortie, { recursive: true });
const chemin = join(sortie, "preuve-appareil.json");
writeFileSync(chemin, JSON.stringify(preuve, null, 2) + "\n");

console.log(`\n  🟢 PREUVE ÉCRITE — ${chemin}`);
console.log(`     appareil : ${modele} (${os}) · écran ${taille.largeurPx}x${taille.hauteurPx} px · densité ${densite} px/dp`);
console.log(`     insets   : haut ${insets.hautPx} · bas ${insets.basPx} · gauche ${insets.gauchePx} · droite ${insets.droitePx}`);
console.log(`     captures : ${captures.map((c) => c.etape).join(", ")}`);
console.log(`     verdicts : A=${lecture.a.state} · G=${lecture.g.state}\n`);
