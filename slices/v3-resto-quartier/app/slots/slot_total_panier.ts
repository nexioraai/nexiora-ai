export function runSlot(entrees: Record<string, unknown>): { totalLibelle: string; totalMontant: string; nombreArticles: string } {
  const n = Object.values(entrees).filter(Array.isArray).reduce((a, b) => a + b.length, 0);
  return { totalLibelle: String(n), totalMontant: String(n), nombreArticles: String(n) };
}
