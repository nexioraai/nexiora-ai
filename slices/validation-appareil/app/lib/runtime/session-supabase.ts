// RUNTIME COPIÉ — SESSION VÉRIFIÉE (Phase 4, extension du lock).
//
// Implémentation RÉELLE du contrat `SessionProvider` : l'identité est établie
// par un serveur, pas déclarée par l'appareil. C'est la différence exacte avec
// `session-locale.ts`, qui reste le comportement des documents ne déclarant
// aucune intégration d'authentification.
//
// Le CLIENT est INJECTÉ : ce module ne construit aucune connexion et n'impose
// aucun transport. Les tests l'exercent donc sans réseau — un fournisseur qui
// ne peut être éprouvé qu'en ligne n'est pas éprouvé.
//
// F3 : aucun texte naturel — les diagnostics sont des codes.
import type { SessionProvider } from "./session-contract";

/** Sous-ensemble EXACT de `@supabase/supabase-js` dont ce module dépend. */
export interface ClientAuth {
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } } | null } }>;
    signInWithPassword(c: { email: string; password: string }): Promise<{
      data: { session: { user: { id: string } } | null };
      error: { message: string } | null;
    }>;
    signUp(c: { email: string; password: string }): Promise<{
      data: { session: { user: { id: string } } | null };
      error: { message: string } | null;
    }>;
    signOut(): Promise<{ error: { message: string } | null }>;
    onAuthStateChange(
      cb: (evenement: string, session: { user: { id: string } } | null) => void,
    ): { data: { subscription: { unsubscribe(): void } } };
  };
}

export interface SessionVerifiee extends SessionProvider {
  /** Cette implémentation le fournit TOUJOURS — l'attente y est un état réel. */
  enAttenteConfirmation(): boolean;
  ouvrir(email: string, motDePasse: string): Promise<boolean>;
  creer(email: string, motDePasse: string): Promise<boolean>;
  fermer(): Promise<void>;
}

export function creerSessionSupabase(client: ClientAuth): SessionVerifiee {
  let identite: string | undefined;
  // 1.14.0 — compte créé, session non ouverte : le serveur attend un clic.
  let attenteConfirmation = false;
  const ecouteurs = new Set<() => void>();
  const notifier = (): void => {
    for (const e of ecouteurs) e();
  };
  const appliquer = (session: { user: { id: string } } | null): void => {
    const suivant = session?.user.id;
    // Une session ÉTABLIE lève l'attente : la confirmation a eu lieu.
    if (suivant !== undefined && attenteConfirmation) attenteConfirmation = false;
    if (suivant === identite) return;
    identite = suivant;
    notifier();
  };
  // Session DÉJÀ établie (persistée par le client) : on la lit, on ne la
  // suppose pas. Et on suit les changements décidés par le serveur.
  void client.auth.getSession().then((r) => {
    appliquer(r.data.session);
  });
  client.auth.onAuthStateChange((_e, session) => {
    appliquer(session);
  });
  return {
    estAuthentifie: () => identite !== undefined,
    identifiant: () => identite,
    enAttenteConfirmation: () => attenteConfirmation,
    abonner: (ecouteur) => {
      ecouteurs.add(ecouteur);
      return () => {
        ecouteurs.delete(ecouteur);
      };
    },
    ouvrir: async (email, motDePasse) => {
      const r = await client.auth.signInWithPassword({ email, password: motDePasse });
      if (r.error !== null) {
        console.warn(`AIR_AUTH_SIGNIN_REFUSED:${r.error.message}`);
        return false;
      }
      appliquer(r.data.session);
      // Une réponse SANS session n'est pas une connexion — ne jamais le
      // prétendre (cas réel : confirmation par e-mail exigée).
      return r.data.session !== null;
    },
    creer: async (email, motDePasse) => {
      const r = await client.auth.signUp({ email, password: motDePasse });
      if (r.error !== null) {
        console.warn(`AIR_AUTH_SIGNUP_REFUSED:${r.error.message}`);
        return false;
      }
      appliquer(r.data.session);
      // Créé SANS session = confirmation hors-bande attendue. On le DIT, au
      // lieu de retomber sur « anonyme » — indiscernable d'un échec.
      if (r.data.session === null) {
        attenteConfirmation = true;
        notifier();
      }
      return true;
    },
    fermer: async () => {
      await client.auth.signOut();
      attenteConfirmation = false;
      appliquer(null);
    },
  };
}
