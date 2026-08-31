// GÉNÉRÉ — NE PAS ÉDITER (registre des Code Slots, Phase 9 / §4).
// Chaque slot garde SA signature dans son propre module ; le registre
// l'adapte au contrat uniforme du runtime. La conformité des ports est
// vérifiée par le VALIDATEUR AIR, pas par cette frontière.
import { runSlot as SlotDelaiPreparation } from "./slot_delai_preparation";
import { runSlot as SlotRecapitulatifCommande } from "./slot_recapitulatif_commande";
import { runSlot as SlotStatutCommandeLibelle } from "./slot_statut_commande_libelle";
import { runSlot as SlotTotalPanier } from "./slot_total_panier";

export const slotRegistry = {
  slot_delai_preparation: (entrees: Readonly<Record<string, unknown>>) =>
    SlotDelaiPreparation(entrees as never),
  slot_recapitulatif_commande: (entrees: Readonly<Record<string, unknown>>) =>
    SlotRecapitulatifCommande(entrees as never),
  slot_statut_commande_libelle: (entrees: Readonly<Record<string, unknown>>) =>
    SlotStatutCommandeLibelle(entrees as never),
  slot_total_panier: (entrees: Readonly<Record<string, unknown>>) =>
    SlotTotalPanier(entrees as never),
} as const;

export type SlotRegistry = typeof slotRegistry;
