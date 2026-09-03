// COHÉRENCE DE COMPOSITION — INSTRUMENT DE MESURE (Phase 10).
//
// Pourquoi cet instrument existe : trois observations faites SUR APPAREIL
// (Phase 8 puis Phase 10) décrivaient toutes le même genre de défaut sans
// qu'aucune mesure n'en donne l'ampleur — « état vide dupliqué », « action
// proposée alors qu'aucune donnée n'existe », « écran inatteignable ».
// D-039-R1 impose que l'outillage manquant soit PRODUIT dans la phase :
// le voici. Il MESURE, il ne juge pas et il ne bloque rien — la correction
// suppose une évolution du schéma AIR gelé, donc une décision propriétaire.
//
// Les trois propriétés mesurées sont des FAITS de structure, lisibles dans
// l'AIR seul, sans exécution ni appareil.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const CORPUS = join(REPO, "packages/golden-corpus/corpus-v2");

const documents = [
  ...readdirSync(CORPUS)
    .filter((f) => f.endsWith(".air.json"))
    .sort()
    .map((f) => ({ nom: f.replace(".air.json", ""), origine: "corpus gelé", chemin: join(CORPUS, f) })),
  {
    nom: "suivi-conteneurs",
    origine: "slice 2",
    chemin: join(REPO, "slices/conteneurs/air/suivi-conteneurs.air.json"),
  },
];

const prop = (bloc, cle) => (bloc.props ?? []).find((p) => p.key === cle)?.value;

const analyse = (air) => {
  const cibles = new Set(
    air.actions.filter((a) => a.effect.kind === "navigate").map((a) => a.effect.screenId),
  );
  const etatsVidesDupliques = [];
  const actionsDupliquees = [];
  for (const ecran of air.screens) {
    const liste = ecran.blocks.find((b) => b.blockType === "list");
    const vides = ecran.blocks.filter((b) => b.blockType === "empty_state");
    // MISE À JOUR (D-044) : un `empty_state` CONDITIONNÉ n'est plus une
    // duplication — il ne s'affiche que quand la liste est vide, ce qui est
    // exactement le comportement attendu. Seuls les blocs SANS condition
    // sont comptés. Sans cette mise à jour, l'instrument continuerait de
    // signaler un défaut que le contrat vient de rendre impossible.
    const videsNonConditionnes = vides.filter((b) => b.visibleWhen === undefined);
    if (liste !== undefined && videsNonConditionnes.length > 0) {
      etatsVidesDupliques.push({
        ecran: ecran.id,
        listeAvecEtatVideInterne: prop(liste, "emptyTitle") !== undefined,
        blocsEmptyState: videsNonConditionnes.map((b) => b.id),
      });
    }
    const parAction = {};
    for (const b of ecran.blocks) {
      const a = prop(b, "actionId");
      if (typeof a === "string") (parAction[a] ??= []).push(`${b.id}(${b.blockType})`);
    }
    for (const [actionId, blocs] of Object.entries(parAction)) {
      // Deux blocs exposant la même action ne se contredisent que s'ils
      // peuvent être visibles EN MÊME TEMPS. Des conditions mutuellement
      // exclusives (entity_empty / entity_not_empty sur la même entité) ne
      // sont donc pas une duplication.
      if (blocs.length <= 1) continue;
      const conditions = ecran.blocks
        .filter((b) => blocs.some((x) => x.startsWith(`${b.id}(`)))
        .map((b) => b.visibleWhen);
      const exclusives =
        conditions.length === 2 &&
        conditions.every((c) => c !== undefined) &&
        conditions[0].entityId === conditions[1].entityId &&
        conditions[0].kind !== conditions[1].kind;
      if (!exclusives) actionsDupliquees.push({ ecran: ecran.id, actionId, blocs });
    }
  }
  const ecransSansChemin = air.screens
    .map((s) => s.id)
    .filter((id) => id !== air.navigation.entryScreenId && !cibles.has(id));
  return { etatsVidesDupliques, actionsDupliquees, ecransSansChemin };
};

const parDocument = documents.map((d) => {
  const air = JSON.parse(readFileSync(d.chemin, "utf8"));
  return { document: d.nom, origine: d.origine, ecrans: air.screens.length, ...analyse(air) };
});

const somme = (f) => parDocument.reduce((n, d) => n + f(d), 0);
const rapport = {
  mesure: "cohérence de composition des applications générées",
  phase: 10,
  documents: parDocument.length,
  ecransTotaux: somme((d) => d.ecrans),
  totaux: {
    etatsVidesDupliques: somme((d) => d.etatsVidesDupliques.length),
    actionsExposeesDeuxFois: somme((d) => d.actionsDupliquees.length),
    ecransSansCheminDeNavigation: somme((d) => d.ecransSansChemin.length),
  },
  lecture: {
    etatsVidesDupliques:
      "Un bloc `empty_state` SANS condition coexiste avec un bloc `list` qui porte déjà son propre état vide. Depuis l'AIR 1.1.0 (D-044), un `visibleWhen` supprime le défaut : seuls les blocs non conditionnés sont comptés.",
    actionsExposeesDeuxFois:
      "La MÊME action est proposée par deux blocs du même écran (typiquement un bouton et le CTA d'un état vide). Ce n'est une duplication VISIBLE que parce que l'état vide n'est pas conditionné.",
    ecransSansCheminDeNavigation:
      "Aucune action à effet `navigate` ne cible ces écrans, et ils ne sont pas l'écran d'entrée : rien dans l'app ne permet de les atteindre.",
  },
  causeCommune:
    "Le schéma AIR 1.0.0 GELÉ ne porte aucun moyen de conditionner le rendu d'un bloc (`blockInstanceSchema` = id, blockType, entityId?, props), et aucun validateur ne contrôle l'accessibilité du graphe de navigation. Ces trois mesures sont donc des conséquences d'une limite de CONTRAT, pas des erreurs d'un document particulier.",
  parDocument,
};

mkdirSync(join(HERE, "results"), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(join(HERE, "results", `composition-${stamp}.json`), JSON.stringify(rapport, null, 2) + "\n");
writeFileSync(join(HERE, "results", "composition-latest.json"), JSON.stringify(rapport, null, 2) + "\n");
console.log(JSON.stringify({ documents: rapport.documents, ecrans: rapport.ecransTotaux, ...rapport.totaux }, null, 2));
for (const d of parDocument) {
  const n = d.etatsVidesDupliques.length + d.actionsDupliquees.length + d.ecransSansChemin.length;
  if (n > 0) {
    console.log(`  ${d.document.padEnd(24)} ${d.ecrans} écrans · vides dupliqués ${d.etatsVidesDupliques.length} · actions doublées ${d.actionsDupliquees.length} · écrans sans chemin ${d.ecransSansChemin.length}`);
  }
}
