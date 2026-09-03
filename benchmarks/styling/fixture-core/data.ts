// P-003 — 500 éléments DÉTERMINISTES (aucun aléa : mêmes données pour tous
// les candidats et tous les runs).
import type { CardData } from "./contracts";

const CATEGORIES = ["Plat", "Boisson", "Dessert", "Menu", "Promo"];
const ADJECTIFS = ["maison", "du jour", "signature", "classique", "saison"];

export const CARDS: CardData[] = Array.from({ length: 500 }, (_, i) => ({
  id: `card_${i}`,
  title: `${CATEGORIES[i % 5]} n°${i + 1} ${ADJECTIFS[i % 5]}`,
  subtitle: `Référence ${1000 + i} · lot ${(i % 12) + 1} · stock ${(i * 7) % 90}`,
  badge: CATEGORIES[(i + 2) % 5],
  amount: `${((i % 40) + 5).toFixed(0)},${(i % 100).toString().padStart(2, "0")} €`,
}));
