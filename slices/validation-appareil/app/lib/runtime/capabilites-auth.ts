// RUNTIME COPIÉ — FOURNISSEUR DE CAPABILITIES POUR `auth` (Phase 4).
//
// Première capability du registre gelé dont la déclaration produit RÉELLEMENT
// du code dans l'app émise. Les autres restent sans effet : ce fournisseur
// n'honore QUE `auth`, et REFUSE tout le reste — il ne devient pas un
// fourre-tout qui prétendrait implémenter ce qu'il n'implémente pas.
//
// Méthodes honorées : `signIn` (paramètre `identifiant`) et `signOut`.
// Toute autre méthode d'`auth` est refusée et tracée, comme le défaut.
import type { CapabilityCall, CapabilityProvider } from "./capability-provider";
import type { SessionLocale } from "./session-locale";

export function creerCapabilitesAuth(session: SessionLocale): CapabilityProvider {
  return {
    invoke: (call: CapabilityCall): boolean => {
      if (call.capability !== "auth") {
        // Code, jamais texte naturel (F3) — module de runtime moteur.
        console.warn(`AIR_CAPABILITY_NOT_IMPLEMENTED:${call.capability}.${call.method}`);
        return false;
      }
      if (call.method === "signOut") {
        session.fermer();
        return true;
      }
      if (call.method === "signIn") {
        // Le document DÉCLARE quel champ porte l'identité (`identifiantFieldId`)
        // — deviner « le premier champ e-mail » serait une convention, donc une
        // supposition. Sans déclaration, rien n'est établi : on refuse.
        const champ = call.params.identifiantFieldId;
        if (typeof champ !== "string") {
          console.warn("AIR_CAPABILITY_AUTH_IDENTIFIANT_FIELD_MISSING");
          return false;
        }
        const brut = call.params[champ];
        return typeof brut === "string" && session.ouvrir(brut);
      }
      console.warn(`AIR_CAPABILITY_NOT_IMPLEMENTED:${call.capability}.${call.method}`);
      return false;
    },
  };
}
