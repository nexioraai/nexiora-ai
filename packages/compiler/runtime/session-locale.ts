// RUNTIME COPIÉ — SESSION LOCALE (Phase 4).
//
// 🔴 CE QUE C'EST, DIT SANS DÉTOUR : une session tenue EN MÉMOIRE dans
// l'appareil. Elle établit une identité DÉCLARÉE par la personne, jamais
// VÉRIFIÉE par un serveur. C'est l'exact équivalent, pour l'identité, de
// `demo.data.ts` pour les données : le parcours est réel et jugeable, la
// vérification vient avec l'implémentation distante.
//
// Une session VÉRIFIÉE (registre `auth` : Supabase email/OTP) est une autre
// implémentation du même contrat `SessionProvider`. Elle exige d'étendre le
// lock EMBARQUÉ du moteur — décision propriétaire (D-059) — et n'est donc
// pas fournie ici. Le contrat, lui, ne changera pas : c'est tout l'intérêt
// de la couture.
//
// Aucune persistance : quitter l'app déconnecte. Prétendre le contraire
// exigerait `offline_storage`, capability déclarée mais non implémentée.
import type { SessionProvider } from "./session-contract";

export interface SessionLocale extends SessionProvider {
  /** Établit la session locale. `false` si l'identifiant est vide. */
  ouvrir(identifiant: string): boolean;
  /** Termine la session. */
  fermer(): void;
}

export function creerSessionLocale(): SessionLocale {
  let identite: string | undefined;
  const ecouteurs = new Set<() => void>();
  const notifier = (): void => {
    for (const e of ecouteurs) e();
  };
  return {
    estAuthentifie: () => identite !== undefined,
    identifiant: () => identite,
    abonner: (ecouteur) => {
      ecouteurs.add(ecouteur);
      return () => {
        ecouteurs.delete(ecouteur);
      };
    },
    ouvrir: (valeur) => {
      const propre = valeur.trim();
      // Une identité VIDE n'est pas une identité — refuser, jamais inventer.
      if (propre === "") return false;
      if (identite === propre) return true;
      identite = propre;
      notifier();
      return true;
    },
    fermer: () => {
      if (identite === undefined) return;
      identite = undefined;
      notifier();
    },
  };
}
