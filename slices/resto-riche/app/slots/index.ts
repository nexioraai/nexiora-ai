// GÉNÉRÉ — NE PAS ÉDITER (registre des Code Slots, Phase 9 / §4).
// Chaque slot garde SA signature dans son propre module ; le registre
// l'adapte au contrat uniforme du runtime. La conformité des ports est
// vérifiée par le VALIDATEUR AIR, pas par cette frontière.
import { runSlot as SlotTotalPanier } from "./slot_total_panier";

export const slotRegistry = {
  slot_total_panier: (entrees: Readonly<Record<string, unknown>>) =>
    SlotTotalPanier(entrees as never),
} as const;

export type SlotRegistry = typeof slotRegistry;
