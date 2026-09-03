export function runSlot(entrees: Record<string, unknown>): { delaiLibelle: string; delaiMinutes: string } {
  const n = Object.values(entrees).filter(Array.isArray).reduce((a, b) => a + b.length, 0);
  return { delaiLibelle: String(n), delaiMinutes: String(n) };
}
