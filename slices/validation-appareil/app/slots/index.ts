// GÉNÉRÉ — NE PAS ÉDITER (registre des Code Slots, Phase 9 / §4).
// Chaque slot garde SA signature dans son propre module ; le registre
// l'adapte au contrat uniforme du runtime. La conformité des ports est
// vérifiée par le VALIDATEUR AIR, pas par cette frontière.
import { runSlot as SlotCodeControleur } from "./slot_code_controleur";
import { runSlot as SlotResumeDeparts } from "./slot_resume_departs";

export const slotRegistry = {
  slot_code_controleur: (entrees: Readonly<Record<string, unknown>>) =>
    SlotCodeControleur(entrees as never),
  slot_resume_departs: (entrees: Readonly<Record<string, unknown>>) =>
    SlotResumeDeparts(entrees as never),
} as const;

export type SlotRegistry = typeof slotRegistry;
