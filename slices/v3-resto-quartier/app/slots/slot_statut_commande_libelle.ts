export function runSlot(entrees: Record<string, unknown>): { statutLibelle: string; statutDetail: string } {
  const n = Object.values(entrees).filter(Array.isArray).reduce((a, b) => a + b.length, 0);
  return { statutLibelle: String(n), statutDetail: String(n) };
}
