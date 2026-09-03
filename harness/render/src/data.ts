// Données DÉTERMINISTES du harnais (aucun aléa — mêmes rendus à chaque run).
import type { ListItemData } from "@deribfy/blocks";

export const CATALOGUE: readonly ListItemData[] = Array.from({ length: 8 }, (_, i) => ({
  id: `itm_${i + 1}`,
  title: `Plat n°${i + 1} maison`,
  subtitle: `Référence ${1000 + i} · lot ${(i % 4) + 1}`,
  trailing: `${9 + i},${(i * 17) % 100 < 10 ? "0" : ""}${(i * 17) % 100} €`,
  badge: i % 3 === 0 ? "Promo" : undefined,
}));

export const REGLAGES: readonly ListItemData[] = [
  { id: "itm_notifications", title: "Notifications", badge: "3" },
  { id: "itm_langue", title: "Langue", trailing: "FR" },
  { id: "itm_confidentialite", title: "Confidentialité" },
];
