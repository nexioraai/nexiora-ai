import 'server-only';

// ============================================================
// P0-3.9 Section 9 — Classification d'erreur Printful/Gelato.
//
// [STATIC REVIEW] Aucune documentation Printful/Gelato ne confirme une
// classification permanent/transitoire officielle (comme pour CJ, qui
// reste isolé, non copié ici). Cette classification s'appuie sur deux
// sources vérifiées directement dans le code, pas sur une hypothèse :
//
// 1. `pfFetch`/`glFetch` (printful-adapter.ts:59, gelato-adapter.ts:48)
//    préfixent systématiquement leurs erreurs par le code HTTP réel
//    (`Printful 422: ...`, `Gelato 404 /path: ...`). Un statut 4xx
//    (hors 429, rate-limit, intrinsèquement transitoire) représente,
//    par convention HTTP générale — pas une supposition Printful/Gelato
//    spécifique — une requête rejetée qui ne changera pas sans
//    modification des données envoyées : PERMANENT.
// 2. Deux messages de validation Gelato pré-vol, cités verbatim depuis
//    gelato-adapter.ts:304/350 ("Aucun design (fileUrl) fourni pour
//    Gelato", "Gelato: aucun deliveryPromiseId au quote") : des
//    problèmes de données/config qui ne se résolvent pas par un simple
//    retry — PERMANENT, par lecture directe du code, pas invention.
//
// Tout le reste (5xx, timeout, erreur réseau, format non reconnu)
// reste UNKNOWN, explicitement, jamais reclassé en permanent par
// supposition (P0-3.9 Section 9 : "UNKNOWN doit rester explicitement
// inconnu plutôt que d'inventer une classification").
// ============================================================

export type ProviderErrorClassification = 'permanent' | 'unknown';

const GELATO_KNOWN_PERMANENT_MESSAGES = [
  'Aucun design (fileUrl) fourni pour Gelato',
  'Gelato: aucun deliveryPromiseId au quote',
];

export function classifyProviderError(errorMessage: string | undefined | null): ProviderErrorClassification {
  const msg = errorMessage || '';

  if (GELATO_KNOWN_PERMANENT_MESSAGES.some((known) => msg.includes(known))) {
    return 'permanent';
  }

  const match = msg.match(/^\S+\s+(\d{3})/);
  if (match) {
    const status = Number(match[1]);
    if (status >= 400 && status < 500 && status !== 429) {
      return 'permanent';
    }
  }

  return 'unknown';
}
