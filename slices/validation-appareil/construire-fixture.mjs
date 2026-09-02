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

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const ICI = join(fileURLToPath(import.meta.url), "..");
const R = join(ICI, "..", "..") + "/";

const brut = JSON.parse(readFileSync(R + "packages/golden-corpus/corpus-v3/bus-intercites.air.json", "utf8"));

// E1 — filtres pilotés sur la liste des départs : 1 filtre littéral existant
// (statut ≠ annule) + 2 pilotés = 3 au total (plafond du contrat D-129).
const departs = brut.screens.find((s) => s.id === "scr_departs");
const liste = departs.blocks.find((b) => b.blockType === "list");
liste.props.push(
  { key: "userFilterFieldIds", value: ["fld_depart_statut", "fld_depart_destination"] },
  { key: "userFilterOperators", value: ["eq", "contains"] },
  { key: "userFilterInputTypes", value: ["choice", "text"] },
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

writeFileSync(join(ICI, "validation-appareil.air.json"), JSON.stringify(brut, null, 2) + "\n");
console.log(`🟢 fixture écrite — domaine ${DOMAINE} · refresh ${REFRESH_SECONDS}s · E1+E2+E3.1+E3.3`);
