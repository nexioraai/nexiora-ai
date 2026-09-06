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
  /**
   * EN ATTENTE DE CONFIRMATION (1.14.0) — le serveur a ACCEPTÉ la création du
   * compte mais n'a ouvert AUCUNE session : il attend un clic dans un e-mail.
   *
   * Fait mesuré : sans ce troisième état, l'app n'avait que « anonyme » ou
   * « connecté ». Une inscription réussie retombait donc sur « anonyme » —
   * indiscernable d'un échec, et rien à l'écran ne bougeait. L'utilisateur
   * voyait « il ne se passe rien » alors que tout avait fonctionné.
   *
   * OPTIONNEL : une implémentation sans confirmation hors-bande (session
   * locale) ne le porte pas, et son comportement est inchangé.
   */
  enAttenteConfirmation?(): boolean;
}
