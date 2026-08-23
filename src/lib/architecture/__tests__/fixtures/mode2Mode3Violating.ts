// Fixture jetable — CONTRÔLE POSITIF de la frontière Mode 2 / Mode 3.
//
// Ne fait partie d'aucun domaine réel du produit : n'est référencé que par
// mode2Mode3Boundaries.test.ts. Contient délibérément, UNE LIGNE PAR RÈGLE,
// les motifs interdits déclarés dans domainRegistry.ts, afin de PROUVER que
// chaque règle détecte réellement ce qu'elle prétend détecter.
//
// Un garde structurel vert à tort est pire que pas de garde. Ce dépôt a déjà
// connu le piège d'un test jamais collecté par vitest.config.ts — et la
// phase 0 de ce chantier a trouvé, par contrôle de mutation, qu'un premier
// motif (`site.mode`) laissait passer `s.mode === 3`. D'où le principe :
// une règle sans contrôle positif n'est pas une règle.
//
// Les motifs sont portés par des chaînes : le moteur (checkDomainBoundaries)
// lit les lignes brutes, la sémantique TypeScript n'entre pas en jeu. Ce
// fichier reste donc trivialement valide et n'introduit aucune dépendance.
// Une ligne = une règle, pour que le contrôle reste lisible.

/** R1a — accès au mode, quel que soit le nom de la variable porteuse. */
export const ACCES_AU_MODE = `const m = payload.mode`

/** R1b — comparaison directe à un numéro de mode. */
export const COMPARAISON_NUMERIQUE = `if (mode === 2) { /* interdit en SHARED */ }`

/** R1c — lecture du mode en base depuis le tronc commun. */
export const LECTURE_DU_MODE_EN_BASE = `query.eq('mode', 3)`

/** R1d — lecture du sous-type, qui est interne au Mode 3. */
export const LECTURE_DU_SOUS_TYPE = `const t = dropship_type`

/** R3b — réception du mode en paramètre par un composant partagé. */
export const RECEPTION_DU_MODE = `export function g(quantite: number, mode: number) {}`

/** R2 — dépendance fournisseur depuis un composant partagé. */
export const IMPORT_FOURNISSEUR = `from '@/lib/cj/client'`

/** R3 — signature recevant un objet de domaine complet. */
export const SIGNATURE_TROP_LARGE = `export function f(site: Site) {}`

/** Acyclicité — le domaine fournisseur importe le domaine marchand. */
export const IMPORT_MODE_2_DEPUIS_MODE_3 = `from '@/lib/mode2/onOrderPaid'`

/** A5 — l'aiguillage parle directement a un fournisseur. */
export const IMPORT_FOURNISSEUR_DEPUIS_AIGUILLAGE = `from '@/lib/suppliers/cj-adapter'`

/** A5 — l'aiguillage reimplemente la selection fournisseur. */
export const SELECTION_FOURNISSEUR_DANS_AIGUILLAGE = `const s = suppliersForDropshipType(x)`

/** A9 — un moteur relit le mode du site. C'est LA rechute a empecher. */
export const MOTEUR_RELIT_LE_MODE = `.select('mode, dropship_type')`
