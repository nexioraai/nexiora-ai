export function runSlot(entrees: { valeur?: string }): { resultat: string } {
  return { resultat: String(entrees.valeur ?? "") };
}
