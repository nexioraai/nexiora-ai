// RUNTIME COPIÉ — ÉCRITURE VERS LE BACKEND (volet 3).
//
// Fait mesuré avant ce module : `magasin-donnees` écrivait EN MÉMOIRE et
// `source-reseau` ne faisait que LIRE. Une réservation, un profil enregistré,
// disparaissaient à la fermeture de l'app — sans que rien ne le dise.
//
// Ce module DÉCORE le magasin : l'écriture part vers PostgREST, et
// l'instantané local n'est mis à jour que si le serveur l'a ACCEPTÉE. Refuser
// et le dire vaut mieux qu'afficher une donnée que personne ne conserve.
//
// SYNCHRONE PAR CONTRAT, comme les capabilities : `true` signifie « l'écriture
// est PARTIE », pas « le serveur a répondu ». La réponse arrive par
// notification du magasin. Bloquer pour rendre un booléen ferait mentir un
// contrat que tout le runtime partage.
//
// F3 : aucun texte naturel — les diagnostics sont des codes.
import type { MagasinDonnees } from "./magasin-donnees";

/** Réponse d'écriture : seule l'erreur nous intéresse. */
export interface ReponseEcriture {
  readonly error: { readonly message: string } | null;
}

/**
 * DÉPENDANCES FONCTIONNELLES, pas un client entier. Décrire la forme complète
 * de `SupabaseClient` reviendrait à recopier ses génériques — et à casser à
 * chaque montée de version. L'appelant fournit DEUX fonctions ; ce module ne
 * connaît ni Supabase, ni PostgREST, et reste testable sans réseau.
 */
export interface PortEcriture {
  ecrire(table: string, ligne: Record<string, unknown>): PromiseLike<ReponseEcriture>;
  supprimer(table: string, id: string): PromiseLike<ReponseEcriture>;
}

/**
 * Champs à NE JAMAIS envoyer : un champ `sensitive` est saisi, jamais conservé.
 * La liste vient du DOCUMENT (elle est passée à la construction), elle n'est
 * pas devinée — et sans elle, un mot de passe partirait vers une colonne qui
 * n'existe même pas.
 */
export function creerMagasinEcrivain(options: {
  readonly magasin: MagasinDonnees;
  readonly port: PortEcriture;
  readonly champsSensibles: readonly string[];
}): MagasinDonnees {
  const { magasin, port, champsSensibles } = options;
  const sensibles = new Set(champsSensibles);
  const nettoyer = (values: Readonly<Record<string, string>>): Record<string, string> => {
    const propre: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      // `id` est porté à part ; les champs sensibles ne sortent jamais.
      if (k === "id" || sensibles.has(k)) continue;
      propre[k] = v;
    }
    return propre;
  };
  const envoyer = (entityId: string, id: string, values: Readonly<Record<string, string>>): void => {
    void port.ecrire(entityId, { id, ...nettoyer(values) }).then((r) => {
      if (r.error !== null) {
        console.warn(`AIR_DATA_WRITE_REFUSED:${entityId}:${r.error.message}`);
        return;
      }
      // Acceptée par le serveur : l'instantané local peut refléter la vérité.
      magasin.upsert(entityId, id, values);
    });
  };
  return {
    ...magasin,
    upsert: (entityId, id, values) => {
      envoyer(entityId, id, values);
      return true;
    },
    update: (entityId, id, values) => {
      // Une mise à jour d'une ligne ABSENTE localement reste refusée ici :
      // c'est `upsert` qui exprime « crée-la si besoin ».
      if (magasin.getInstance(entityId, id) === undefined) return false;
      envoyer(entityId, id, values);
      return true;
    },
    remove: (entityId, id) => {
      void port.supprimer(entityId, id).then((r) => {
        if (r.error !== null) {
          console.warn(`AIR_DATA_DELETE_REFUSED:${entityId}:${r.error.message}`);
          return;
        }
        magasin.remove(entityId, id);
      });
      return true;
    },
  };
}
