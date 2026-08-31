// GÉNÉRÉ — NE PAS ÉDITER (registre des Code Slots, Phase 9 / §4).
// Chaque slot conserve SA signature : le registre importe la fonction
// par son nom et n'efface aucun type — `tsc` du projet généré vérifie
// donc la conformité de signature déclarée dans l'AIR (Oracle §9.1).
import { runSlot as SlotTotalPanier } from "./slot_total_panier";

export const slotRegistry = {
  slot_total_panier: SlotTotalPanier,
} as const;

export type SlotRegistry = typeof slotRegistry;
