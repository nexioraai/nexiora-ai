// STUB DE NAVIGATION — enregistre les appels au lieu de naviguer.
// C'est l'INSTRUMENT : il rend la transition OBSERVABLE.
export const journal: { name: string; params?: unknown }[] = [];
export const reset = (): void => { journal.length = 0; };
export const useNavigation = () => ({
  navigate: (name: string, params?: unknown) => { journal.push({ name, params }); },
  goBack: () => { journal.push({ name: "«retour»" }); },
});
