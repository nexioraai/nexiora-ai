// src/lib/commerce-admission/canTransact.ts
//
// PHASE M1-1 du chantier de séparation Mode 1 / Mode 2.
// Plan de référence : plan maître « frontière Mode 1 ↔ Mode 2 ».
//
// ============================================================
// L'ADMISSION AU COMMERCE. PAS LE ROUTAGE D'UNE VENTE.
//
// Deux frontières distinctes coexistent désormais dans ce produit, et les
// confondre serait rejouer le défaut que neuf phases ont servi à défaire :
//
//   ADMISSION  (ici)              « ce site a-t-il le droit de produire un
//                                   artefact commercial ? »
//   ROUTAGE    (order-domain/)    « une vente déjà admise est-elle exécutée
//                                   par le marchand ou par un fournisseur ? »
//
// L'admission se pose EN AMONT, avant qu'un artefact existe. Le routage se
// pose EN AVAL, sur un artefact déjà légitime. Ce module ne doit donc jamais
// parler de fournisseur, de sous-type, ni de `fulfillment_domain` — et
// `order-domain/resolve.ts` ne doit jamais parler d'admission.
//
// POURQUOI UNE ALLOWLIST ET NON `!== 1`.
// Écrire « tout sauf le mode 1 » fait du commerce le comportement PAR DÉFAUT :
// un mode 4 ajouté demain serait commerçant sans que personne l'ait décidé, et
// aucun test ne le verrait. L'allowlist inverse la charge — un mode ne
// commerce que s'il a été inscrit ici, explicitement. C'est la même leçon que
// la garde `=== 'supplier'` de la phase 3 : on nomme ce qu'on autorise, jamais
// ce qu'on exclut.
//
// CE QUE CE MODULE N'A PAS LE DROIT DE CONNAÎTRE : la présence d'un compte de
// paiement, l'existence d'un produit, `hasShop`, un identifiant fournisseur,
// une donnée de commande. Toutes ces choses peuvent empêcher une vente par
// accident ; aucune ne constitue une frontière. La seule autorité est
// `sites.mode`.
// ============================================================

/**
 * Les modes explicitement autorisés à produire un artefact commercial.
 *
 * Le Mode 3 en fait partie : une boutique dropshipping VEND — elle route
 * simplement l'exécution vers un fournisseur. La frontière d'admission n'est
 * donc pas « 1 contre 2 », mais « 1 contre {2, 3} ». Confondre les deux
 * reviendrait à interdire le commerce au Mode 3.
 *
 * Le Mode 1 est absent, et c'est la seule chose que ce fichier affirme à son
 * sujet : une vitrine présente un business, elle ne le fait pas commercer.
 */
export const TRANSACTING_SITE_MODES = [2, 3] as const

export type TransactingSiteMode = (typeof TRANSACTING_SITE_MODES)[number]

/** Recherche en O(1), et surtout : comparaison stricte. `'2'` n'est pas `2`. */
const ADMITTED = new Set<unknown>(TRANSACTING_SITE_MODES)

/**
 * Ce site a-t-il le droit de produire un artefact commercial ?
 *
 * @param siteMode `sites.mode`, tel que lu en base — volontairement typé
 *   `unknown`, comme `resolveFulfillmentDomain`. La valeur vient d'une colonne,
 *   pas d'un contrat TypeScript : la traiter comme garantie serait supposer ce
 *   qu'on ne sait pas.
 *
 * FAIL-CLOSED par construction. `null`, `undefined`, `0`, `4`, `'2'`, `NaN`,
 * un objet — tout ce qui n'est pas littéralement une valeur de
 * `TRANSACTING_SITE_MODES` obtient `false`. Il n'existe aucun chemin par lequel
 * une valeur inattendue devienne commerçante.
 *
 * NE DÉCIDE RIEN D'AUTRE. Cette fonction ne dit pas si la vente doit aboutir,
 * ni qui l'exécute, ni si le stock suffit. Elle répond à une seule question, et
 * c'est ce qui la rend vérifiable d'un seul regard.
 */
export function canTransact(siteMode: unknown): boolean {
  return ADMITTED.has(siteMode)
}
