// GATE COMPOSITION (D-087) — une image déclarée et jamais affichée est un DÉFAUT.
//
// Mesuré avant correction : 23 champs `asset` sur 12 documents, RENDUS NULLE
// PART. Le registre n'avait aucun bloc image, le runtime ne passait rien, les
// fixtures rendaient la chaîne vide. Cette gate empêche le retour du défaut au
// seul niveau qui puisse l'attraper : le DOCUMENT.
const { readdirSync, readFileSync, existsSync } = await import("node:fs");
const { join } = await import("node:path");
const { fileURLToPath } = await import("node:url");
const R = join(fileURLToPath(import.meta.url), "..", "..", "..", "..") + "/";
const { migrateAirDocument } = await import(R + "packages/air-schema/src/migrations.ts");

const SOURCES = [
  ["v2", R + "packages/golden-corpus/corpus-v2/"],
  ["v3", R + "packages/golden-corpus/corpus-v3/"],
].filter(([, d]) => existsSync(d));

// CLIQUET, pas pass/fail : le corpus v2 est GELÉ et le v3 n'a pas encore été
// régénéré avec les règles 23-26. Exiger 0 ferait échouer pour toujours. Le
// nombre d'images orphelines ne doit JAMAIS augmenter.
// Fixé à la mesure RÉELLE sur les DEUX corpus (40), pas au chiffre partiel que
// j'avais annoncé pour le seul v3 (23). Un plafond sous l'état mesuré rendrait
// la gate rouge en permanence ; au-dessus, il ne mordrait pas. Il vaut l'état
// du jour, et seulement lui.
// D-088 · D7 — PLAFOND ABAISSÉ 40 → 38, jamais relevé.
// Un cliquet vaut l'état MESURÉ, et seulement lui. Laissé à 40 alors que la
// mesure était retombée à 38, il tolérait deux nouvelles orphelines en
// silence : un cas-tueur l'a montré en ajoutant un champ image jamais affiché
// sans faire rougir la gate. Un plafond au-dessus de l'état ne mord pas.
const PLAFOND_ORPHELINES = 38;

// ── D-088 · D7 — LE COMPARATEUR INTER-GÉNÉRATIONS EST RETIRÉ.
//
// Cette gate portait un « cliquet anti-déplacement » qui comparait les champs
// image d'un document à une référence enregistrée lors d'une génération
// ANTÉRIEURE. L'hypothèse était : une régénération répare le document
// précédent, donc tout champ disparu est une suppression.
//
// L'hypothèse est FAUSSE, et la preuve est dans le code : `emit-v3.mjs` n'a
// qu'un seul `readFileSync`, sur `.env.local`. Il ne relit JAMAIS le corpus.
// Chaque exécution régénère depuis l'intention seule, et le modèle a le droit
// de remodeler ses entités. Mesuré : une régénération légitime de
// `plombier-urgence` a été comptée comme « 2 champs supprimés » alors qu'elle
// faisait passer les images de 0 à 3 affichages et les orphelines de 3 à 0.
// Un comparateur qui punit une amélioration ne garantit rien : il ment.
//
// La garantie anti-amputation n'est pas perdue — elle est DÉPLACÉE là où elle
// est fondée, c'est-à-dire là où deux documents sont réellement comparables :
//   · INTRA-EXÉCUTION  `@deribfy/repair` · `amputationsHorsPerimetre`,
//     attempt 1 vs attempt 2 — même document, réparé, consigne de tout
//     conserver ;
//   · INTRA-DOCUMENT   `AIR_IMAGE_ORPHELINE` au validateur, et `gate:fidelite`
//     qui refuse un besoin écarté sur un motif que l'enveloppe réfute.
//
// Ce qui RESTE ici est une propriété objective du document COURANT, vérifiable
// sans aucune référence externe : une image déclarée sur une entité affichée
// doit être montrée.

console.log("═".repeat(72));
console.log("GATE COMPOSITION — une image déclarée sur une entité affichée est MONTRÉE");
console.log("═".repeat(72));
console.log("\n  document                  champs image   affichés   orphelins");
console.log("  " + "─".repeat(68));

let orphelines = 0;
const invalides = [];
for (const [tag, dir] of SOURCES) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".air.json")).sort()) {
    // Un document devenu INVALIDE ne doit pas faire planter la gate : elle le
    // RAPPORTE. Une gate qui plante masque l'information au lieu de la donner.
    //
    // 🔴 TROU FERMÉ (D-088 · D7). Un document invalide ne comptait que ses
    // diagnostics d'orphelines — soit ZÉRO quand il échouait pour une autre
    // raison. Rendre un document invalide FAISAIT DONC BAISSER le total et
    // VERDIR la gate : un cas-tueur l'a montré en ajoutant un champ image
    // jamais affiché, ce qui rendait le document invalide et retirait ses
    // orphelines du compte. Un document invalide est désormais un ÉCHEC en
    // lui-même, jamais une remise.
    let air;
    try {
      air = migrateAirDocument(JSON.parse(readFileSync(dir + f, "utf8")));
    } catch (e) {
      const n = (e.diagnostics ?? []).filter((d) => d.code === "AIR_IMAGE_ORPHELINE").length;
      orphelines += n;
      invalides.push(`${tag}/${f.replace(".air.json", "")}`);
      console.log(
        `  ${(tag + "/" + f.replace(".air.json", "")).padEnd(26)}${"REFUSÉ".padStart(9)}${"—".padStart(11)}${String(n).padStart(11)}  🔴 invalide`,
      );
      continue;
    }
    const assets = new Map();
    for (const e of air.entities) {
      for (const c of e.fields) if (c.type === "asset") assets.set(c.id, e.id);
    }
    // 🔴 TROU CORRIGÉ (cas-tueur ③) : ce court-circuit sautait TOUT le contrôle
    // quand un document n'avait plus AUCUN champ image. Or c'est exactement le
    // contournement le plus efficace — supprimer toutes les photos rendait la
    // suppression INVISIBLE. La comparaison à la référence doit donc précéder
    // le saut, jamais le suivre.
    if (assets.size === 0) continue;
    // Un champ est AFFICHÉ si un bloc lié à son entité le désigne par
    // `imageFieldId` — la seule prop qui produise réellement une image.
    const affiches = new Set();
    for (const s of air.screens) {
      for (const b of s.blocks) {
        if (b.entityId === undefined) continue;
        for (const p of b.props ?? []) {
          if (p.key === "imageFieldId" && assets.get(String(p.value)) === b.entityId) {
            affiches.add(String(p.value));
          }
        }
      }
    }
    const orph = [...assets.keys()].filter((k) => !affiches.has(k));
    orphelines += orph.length;

    console.log(
      `  ${(tag + "/" + f.replace(".air.json", "")).padEnd(26)}${String(assets.size).padStart(9)}${String(affiches.size).padStart(11)}${String(orph.length).padStart(11)}${orph.length > 0 ? "  🔴" : "  🟢"}`,
    );
  }
}

console.log("  " + "─".repeat(68));
console.log(`\n  images ORPHELINES : ${String(orphelines)} / plafond ${String(PLAFOND_ORPHELINES)}`);
console.log("  (la disparition d'un champ n'est plus jugée ICI : voir `amputationsHorsPerimetre`)");

console.log(`  documents INVALIDES : ${String(invalides.length)}   (doit être 0)`);
for (const x of invalides) console.log(`     🔴 ${x}`);

// Deux refus, conjonctifs. Aucune compensation : rendre un document invalide
// ne doit JAMAIS faire baisser le compte.
const echec = orphelines > PLAFOND_ORPHELINES || invalides.length > 0;
console.log(
  `\n  ${echec ? "🔴 ÉCHEC — orphelines en hausse, ou document INVALIDE" : "🟢 OK — orphelines stables, aucun document invalide"}`,
);
process.exitCode = echec ? 1 : 0;
