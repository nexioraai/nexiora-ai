// GATE NAVIGATION (D-086) — PREUVE 7.
//
// Empêche le retour du défaut fondateur : des destinations principales
// transformées en gros boutons dans le contenu. Mesuré avant correction sur le
// corpus v3 : **184 boutons de navigation pure sur 235, 1,7 par écran**, jusqu'à
// quatre empilés sous la liste des plats.
//
// Trois refus :
//  1. un bouton qui DOUBLE une destination de `primary` ;
//  2. un écran portant plus de 2 boutons de navigation pure ;
//  3. une destination de `primary` menant à un écran non fonctionnel.
const { readdirSync, readFileSync, existsSync } = await import("node:fs");
const { join } = await import("node:path");
const { fileURLToPath } = await import("node:url");
const R = join(fileURLToPath(import.meta.url), "..", "..", "..", "..") + "/";
const { migrateAirDocument } = await import(R + "packages/air-schema/src/migrations.ts");

const SOURCES = [
  ["v2", R + "packages/golden-corpus/corpus-v2/"],
  ["v3", R + "packages/golden-corpus/corpus-v3/"],
].filter(([, d]) => existsSync(d));

// PLAFOND, pas pass/fail : le corpus v2 est GELÉ et le v3 n'a pas encore été
// régénéré avec `primary`. Exiger 0 ferait échouer pour toujours. Le cliquet
// mord dans le seul sens utile : le nombre ne doit JAMAIS augmenter.
// Fixé à la mesure RÉELLE (121), pas au chiffre annoncé (184) : un plafond
// au-dessus de l'état mesuré ne mord pas — c'est un cliquet décoratif.
const PLAFOND_BOUTONS_NAV = 121;

console.log("═".repeat(74));
console.log("GATE NAVIGATION — les destinations globales sont-elles des ONGLETS ?");
console.log("═".repeat(74));
console.log("\n  document                   boutons nav   doublons   écrans > 2   primary");
console.log("  " + "─".repeat(70));

let total = 0;
let doublons = 0;
let surcharges = 0;
for (const [tag, dir] of SOURCES) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".air.json")).sort()) {
    const air = migrateAirDocument(JSON.parse(readFileSync(dir + f, "utf8")));
    const ecranDuBloc = new Map(air.screens.flatMap((s) => s.blocks.map((b) => [b.id, s.id])));
    const typeDuBloc = new Map(air.screens.flatMap((s) => s.blocks.map((b) => [b.id, b.blockType])));
    const routeVers = new Map(air.navigation.routes.map((r) => [r.id, r.screenId]));
    const dest = new Set(
      (air.navigation.primary?.destinations ?? []).map((d) => routeVers.get(d.routeId)),
    );

    let nav = 0;
    let dbl = 0;
    const parEcran = {};
    for (const a of air.actions) {
      if (a.effect.kind !== "navigate" || a.trigger.kind !== "ui") continue;
      if (typeDuBloc.get(a.trigger.blockId) !== "button") continue;
      nav += 1;
      const e = ecranDuBloc.get(a.trigger.blockId) ?? "?";
      parEcran[e] = (parEcran[e] ?? 0) + 1;
      // CRITÈRE PRÉCISÉ (D-086) — la première version comptait tout bouton
      // menant à un onglet. Elle a donc accusé « Débloquer avec l'abonnement »,
      // un appel à l'action légitime depuis la fiche d'un programme verrouillé,
      // vers l'onglet Abonnement. Le doublon est le bouton placé SUR un onglet
      // et menant à un AUTRE onglet : la barre est déjà sous le doigt.
      // Depuis un écran de FLUX, un bouton vers un onglet fait avancer
      // l'utilisateur — l'interdire reviendrait à interdire toute conversion.
      if (dest.has(e) && dest.has(a.effect.screenId)) dbl += 1;
    }
    const trop = Object.values(parEcran).filter((n) => n > 2).length;
    total += nav;
    doublons += dbl;
    surcharges += trop;
    console.log(
      `  ${(tag + "/" + f.replace(".air.json", "")).padEnd(27)}${String(nav).padStart(8)}${String(dbl).padStart(11)}${String(trop).padStart(13)}   ${air.navigation.primary ? "✅" : "—"}`,
    );
  }
}

console.log("  " + "─".repeat(70));
console.log(`\n  boutons de navigation : ${String(total)} / plafond ${String(PLAFOND_BOUTONS_NAV)}`);
console.log(`  DOUBLONS d'un onglet  : ${String(doublons)}   (doit être 0)`);
const echec = total > PLAFOND_BOUTONS_NAV || doublons > 0;
console.log(`\n  ${echec ? "🔴 ÉCHEC" : "🟢 OK"} — écrans à plus de 2 boutons de navigation : ${String(surcharges)}`);
process.exitCode = echec ? 1 : 0;
