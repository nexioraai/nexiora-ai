// Accès indexé strict pour les fixtures de test : le tsconfig du paquet
// active noUncheckedIndexedAccess — on échoue net plutôt que de propager un
// undefined silencieux.
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`fixture : index ${String(index)} hors limites`);
  }
  return item;
}
