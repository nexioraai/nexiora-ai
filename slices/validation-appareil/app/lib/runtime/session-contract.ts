// RUNTIME COPIÉ — CONTRAT DE SESSION, TYPES PURS (Phase 4).
//
// Séparé de `session-provider.tsx` parce qu'un module `.ts` ne peut pas
// importer un module JSX : les implémentations (`session-locale`,
// `session-supabase`) sont du TypeScript pur et doivent pouvoir dépendre du
// contrat sans traîner React derrière elles. Le contexte React, lui, vit dans
// le `.tsx` et RÉ-EXPORTE ce contrat — un seul contrat, deux portes.
export interface SessionProvider {
  /** `true` si une identité est ÉTABLIE. Jamais une supposition. */
  estAuthentifie(): boolean;
  /** Identifiant de l'utilisateur courant — absent tant qu'aucune identité. */
  identifiant(): string | undefined;
  /** Abonnement aux changements d'état — rend la fonction de désabonnement. */
  abonner(ecouteur: () => void): () => void;
}
