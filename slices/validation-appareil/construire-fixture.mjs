// CHANTIER APPAREIL & FIL RÉEL — CONSTRUCTION DE LA FIXTURE (arbitrage 2026-09-02).
// Le document bus du corpus (artefact porteur ARBITRAIRE — le mécanisme est
// sector-agnostic) reçoit les QUATRE surfaces à valider sur appareil :
// E1 (filtres pilotés) · E2 (liste scopée) · E3.1 (états du magasin) ·
// E3.3 (provenance distante). Patch DÉTERMINISTE, document final validé par
// le VRAI chemin (migrateAirDocument à l'émission). AUCUN réseau ici.
//
// DOMAINE — UNE SEULE CONSTANTE (échappatoire à une ligne avant build) :
// dérivé du metadataBase canonique d'apps/web (www.deribfy.com, possédé par
// le propriétaire, hébergement statique Vercel existant). Choisi par
// l'arbitrage option ③ (fichier statique) ; remplaçable ICI puis relancer
// construire → emettre → verifier.
export const DOMAINE = "www.deribfy.com";
export const REFRESH_SECONDS = 30;

// ⛔ DET-031 — GÉNÉRATEUR DÉSYNCHRONISÉ DE LA REFONTE (2026-09-05).
// Ce script reconstruit le document depuis corpus-v3/bus-intercites.air.json,
// qui NE CONTIENT PAS les phases 1-3 de la refonte UX : l'exécuter ÉCRASE
// validation-appareil.air.json avec l'état d'avant-refonte. Démontré deux
// fois (airHash 812b93fd… détruit le 2026-09-05 matin ; rejoué le même jour
// après-midi, restauré par git). NE PAS L'EXÉCUTER avant qu'il soit rebasé
// sur le document de la refonte. Les corrections produit se font DANS
// validation-appareil.air.json, puis se reportent ici.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ICI = join(fileURLToPath(import.meta.url), "..");
const R = join(ICI, "..", "..") + "/";

const brut = JSON.parse(readFileSync(R + "packages/golden-corpus/corpus-v3/bus-intercites.air.json", "utf8"));

// E1 — filtre piloté sur la liste des départs : 1 filtre littéral existant
// (statut ≠ annule) + 1 piloté (statut, chips). DET-031 (jugement
// propriétaire, 2026-09-05) : le filtre TEXTE sur la destination est RETIRÉ —
// il doublonnait la recherche (même champ, même opérateur `contains`) et
// découpait l'écran en tranches. Il n'existait que pour exercer le type
// d'entrée `text` du contrat E1 : besoin de CAMPAGNE, pas de produit ; cette
// couverture reste tenue par les tests du pipeline (list-pipeline).
const departs = brut.screens.find((s) => s.id === "scr_departs");
const liste = departs.blocks.find((b) => b.blockType === "list");
liste.props.push(
  { key: "userFilterFieldIds", value: ["fld_depart_statut"] },
  { key: "userFilterOperators", value: ["eq"] },
  { key: "userFilterInputTypes", value: ["choice"] },
);

// E2 — liste des billets SCOPÉE au départ courant, AJOUTÉE (additif : rien
// n'est retiré de l'écran) sur scr_depart_detail (detail_header ent_depart ;
// fld_billet_depart → ent_depart : sémantique BLOCK_SCOPE_INVALID satisfaite).
const detail = brut.screens.find((s) => s.id === "scr_depart_detail");
detail.blocks.push({
  blockType: "list",
  entityId: "ent_billet",
  id: "blk_detail_billets_scopes",
  props: [
    { key: "title", value: "Billets de ce départ" },
    { key: "titleFieldId", value: "fld_billet_passager" },
    { key: "subtitleFieldId", value: "fld_billet_date_achat" },
    { key: "trailingFieldId", value: "fld_billet_prix_total" },
    { key: "badgeFieldId", value: "fld_billet_statut" },
    { key: "scopeFieldId", value: "fld_billet_depart" },
    { key: "sortFieldId", value: "fld_billet_date_achat" },
    { key: "sortDirection", value: "desc" },
    { key: "pageSize", value: 10 },
    { key: "loadingTitle", value: "Chargement des billets…" },
    { key: "errorTitle", value: "Billets indisponibles" },
    { key: "errorMessage", value: "Les billets de ce départ n'ont pas pu être chargés." },
    { key: "emptyTitle", value: "Aucun billet pour ce départ" },
    { key: "emptyMessage", value: "Ce départ n'a encore aucun billet réservé." },
  ],
});

// E3.3 — provenance distante APLANIE (1.7.1) sur data_departs, domaine gravé,
// polling déclaré. E3.1 est porté par la même app (magasin + états réels).
const ds = brut.datasets.find((d) => d.id === "data_departs");
ds.sourceKind = "remote";
ds.sourceIntegrationId = "intg_cache_billets";
ds.sourceDomain = DOMAINE;
ds.sourceRefreshSeconds = REFRESH_SECONDS;
if (!brut.network.allowedDomains.includes(DOMAINE)) brut.network.allowedDomains.push(DOMAINE);

// 🔴 ÉCRITURE GARDÉE (2026-09-05) — DÉFAUT MESURÉ, PAS SUPPOSÉ.
//
// Cette écriture était au niveau supérieur du module. Or `verifier.mjs`
// IMPORTE ce fichier pour deux constantes (`DOMAINE`, `REFRESH_SECONDS`) :
// lancer la batterie pré-build RÉÉCRIVAIT donc la fixture depuis zéro et
// EFFAÇAIT toute édition du document. Constaté en session : les modifications
// de la refonte — écran Paramètres, icônes, libellés — ont disparu entre
// l'émission et le build, et un build EAS est parti sur le document
// d'origine. Une batterie de vérification qui détruit ce qu'elle vérifie est
// pire qu'absente.
//
// L'écriture n'a lieu que si CE fichier est EXÉCUTÉ. Importé, il n'expose que
// ses constantes et ne touche à rien.
const executeDirectement =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (executeDirectement) {
  writeFileSync(join(ICI, "validation-appareil.air.json"), JSON.stringify(brut, null, 2) + "\n");
  console.log(`🟢 fixture écrite — domaine ${DOMAINE} · refresh ${REFRESH_SECONDS}s · E1+E2+E3.1+E3.3`);
}
