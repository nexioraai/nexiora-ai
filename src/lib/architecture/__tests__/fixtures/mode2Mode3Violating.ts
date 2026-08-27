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

// ---- Phase 4 : le point de vente ne decide plus du domaine ----
// Une ligne par regle de CHECKOUT_MUST_NOT_DECIDE_ON_MODE. Ces six formes
// sont les rechutes reellement plausibles : un huitieme branchement metier
// ecrit dans checkout/route.ts reproduirait le comportement actuel et ne
// ferait echouer AUCUN test de caracterisation. Seul un garde structurel le
// voit — et un garde sans controle positif n'est pas un garde.

/** Comparaison directe du mode dans le point de vente. */
export const COMPARAISON_DU_MODE = `if (site.mode === 3) { supplierCost = x }`

/** Comparaison inversee — la forme qu'un motif ancre a gauche laisserait passer. */
export const COMPARAISON_INVERSEE = `if (3 !== site.mode) { return }`

/** Aiguillage sur le mode. */
export const AIGUILLAGE_SUR_LE_MODE = `switch (site.mode) { case 3: break }`

/** Appartenance a un ensemble de modes — un branchement deguise. */
export const APPARTENANCE_DE_MODE = `if ([2, 3].includes(site.mode)) { f() }`

/** Branchement sur la veracite du mode, ternaire ou if direct. */
export const VERACITE_DU_MODE = `const commission = site.mode ? 0.06 : 0;`

/** Acquisition : extraire le mode rend invisible le branchement qui suit. */
export const ACQUISITION_DU_MODE = `const m = site.mode;`

/** Acquisition par destructuration. */
export const ACQUISITION_PAR_DESTRUCTURATION = `const { id, mode } = site;`

/** Acquisition par crochets — contourne tout motif ancre sur `site.mode`. */
export const ACQUISITION_PAR_CROCHETS = `const m = site['mode'];`

/** Alias du site entier : contourne toutes les regles ci-dessus en une ligne. */
export const ALIAS_DU_SITE_ENTIER = `const s = site;`

// ---- Phase 5 / F4 : l'annulation ne parle plus a un fournisseur ----

/** R2 — les identifiants d'un fournisseur portes hors de son domaine. C'est la
 *  forme exacte trouvee dans cancel-order : une arete de dependance
 *  reconstituee par la CONFIGURATION, sans aucun import a detecter. */
export const IDENTIFIANTS_FOURNISSEUR = `const CJ_EMAIL = process.env.CJ_EMAIL || ''`


// ---- M1-2 : l'admission ne doit ni router, ni faillir en fail-open ----

/** Le point d'admission parle du domaine d'execution : confusion des frontieres. */
export const ADMISSION_PARLE_DE_ROUTAGE = `if (order.fulfillment_domain === 'merchant') {}`

/** Fail-OPEN : tout mode inconnu deviendrait commercant sans decision. */
export const ADMISSION_FAIL_OPEN = `if (siteMode !== 1) { autoriser() }`
