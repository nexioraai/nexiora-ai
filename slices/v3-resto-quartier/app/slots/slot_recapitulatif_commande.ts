export function runSlot(entrees: Record<string, unknown>): { recapitulatifTexte: string; totalLibelle: string } {
  const n = Object.values(entrees).filter(Array.isArray).reduce((a, b) => a + b.length, 0);
  return { recapitulatifTexte: String(n), totalLibelle: String(n) };
}
