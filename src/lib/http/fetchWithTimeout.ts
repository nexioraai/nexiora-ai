import 'server-only';

// Audit timeouts fournisseurs (CJ/Gelato/Printful/Printify) : les fetch()
// bas niveau de chaque client fournisseur n'avaient aucune limite -- un
// fournisseur qui ne repond jamais bloquait indefiniment l'appelant, y
// compris shop/checkout/route.ts (calcul de livraison en direct pendant un
// paiement reel). AbortSignal.timeout() est natif (Node >=17.3, disponible
// sur toute version de Node utilisee par ce projet) : aucune dependance
// ajoutee. Centralise ici plutot que duplique dans les 4 clients
// (cjFetch, glFetch, pfFetch, pyFetch) -- un seul point a faire evoluer,
// un seul comportement a tester.
//
// 15s : aucun des appels concernes n'est un traitement en masse (chaque
// fonction fait un seul fetch() vers un endpoint retournant du JSON) --
// large marge au-dessus d'une latence reseau normale, tres en-dessous de
// tout maxDuration Vercel plausible (le plus bas deja observe dans ce
// depot est 30s, cf. route-canary).
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
