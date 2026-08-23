// src/lib/order-domain/resolve.ts
//
// PHASE 1 du chantier de séparation Mode 2 / Mode 3.
// Plan de référence : docs/PLAN-SEPARATION-MODE2-MODE3.md
//
// ============================================================
// LE POINT DE DÉCISION UNIQUE DE LA FRONTIÈRE.
//
// Ce module répond à UNE question, et à une seule :
//
//     « L'exécution de cette vente incombe-t-elle au marchand,
//       ou à un fournisseur ? »
//
// Il ne répond PAS à « quel fournisseur ? ». Cette seconde question est
// interne au domaine fournisseur et se lit dans mode3/ — jamais ici.
//
// POURQUOI CE MODULE EXISTE.
// Avant lui, aucun endroit du pipeline post-paiement ne posait la question
// du mode : le point d'entrée post-paiement appelait deux moteurs
// fournisseur sans aucune condition. La conséquence a été mesurée en
// exécution réelle sur le code déployé — une commande Mode 2 atteignait les
// deux fournisseurs et déclenchait des commandes réelles chez eux. La
// frontière n'était pas mal placée : elle n'existait pas en aval du paiement.
//
// POURQUOI LE MODE SEUL, ET JAMAIS LE SOUS-TYPE.
// Le mode qualifie un SITE : qui honore ses ventes. Le sous-type qualifie un
// parcours À L'INTÉRIEUR du domaine fournisseur : lequel des trois
// s'applique. Ce sont deux axes différents, pas deux granularités du même.
//
// Une garde antérieure (commit 13bec0e, forme rejetée par la décision D3)
// consultait le sous-type en plus du mode. Mesure comparative sur les 12 cas
// du banc : elle a MODIFIÉ le comportement de deux des trois parcours Mode 3,
// qui fonctionnaient. C'est la preuve empirique qu'une garde de niveau
// DOMAINE ne doit jamais descendre au niveau du parcours : le second
// conjoint n'apportait rien au Mode 2 et n'avait d'effet que sur le Mode 3.
// Le nom exact du champ interdit ici est porté par l'entrée
// `order-domain-frontier` de DOMAIN_REGISTRY — l'écrire dans ce fichier
// déclencherait la règle qu'il décrit.
//
// PREUVE DE NON-RÉGRESSION, par construction.
// Soit G ≡ (domaine === 'supplier'). Pour toute commande d'un site Mode 3,
// G est vraie PAR DÉFINITION de ce module. Une garde `if (!G) sortir`
// placée en tête d'un moteur laisse donc tout chemin Mode 3 STRICTEMENT
// identique : l'instruction suivante est celle qui s'exécutait déjà.
// Vérifié empiriquement : 7 cas Mode 3 sur 7 inchangés.
//
// FAIL-CLOSED.
// Toute valeur qui n'est pas exactement le mode fournisseur donne
// 'merchant' — c'est-à-dire AUCUN appel fournisseur. Un appel fournisseur
// engage de l'argent réel (Nexiora avance le coût) : il ne doit jamais
// partir sans preuve POSITIVE. L'inverse — refuser à tort — laisse une
// commande en attente, récupérable. L'asymétrie des conséquences dicte le
// sens du repli.
//
// Ce module n'importe rien. Il ne lit ni la base, ni un fournisseur, ni un
// sous-type. C'est ce qui le rend vérifiable d'un seul regard, et c'est une
// propriété imposée par une entrée de DOMAIN_REGISTRY.
// ============================================================

/** Qui exécute la commande. Deux valeurs, jamais davantage : un troisième
 *  cas signifierait qu'un mode n'est ni marchand ni fournisseur, ce qui
 *  n'existe pas dans le modèle métier. */
export type FulfillmentDomain = 'merchant' | 'supplier'

/** Le seul mode dont les ventes sont exécutées par un fournisseur.
 *  Constante nommée plutôt que littéral disséminé : la valeur n'apparaît
 *  qu'ici, donc ne peut pas diverger. */
export const SUPPLIER_SITE_MODE = 3

/**
 * Détermine à qui incombe l'exécution d'une vente, à partir du seul mode du
 * site.
 *
 * Appelé UNE FOIS, à la création de la commande. La valeur obtenue est
 * ensuite portée par la commande elle-même (phase 2) : plus aucun consommateur
 * en aval n'a le droit de reposer la question à partir de `sites.mode`.
 *
 * @param siteMode `sites.mode`, tel que lu en base — volontairement typé
 *   `unknown` : cette valeur vient d'une colonne, pas d'un contrat
 *   TypeScript. La traiter comme garantie serait supposer ce qu'on ne sait
 *   pas.
 */
export function resolveFulfillmentDomain(siteMode: unknown): FulfillmentDomain {
  return siteMode === SUPPLIER_SITE_MODE ? 'supplier' : 'merchant'
}

/**
 * Le mode lu correspond-il à une valeur que le produit connaît ?
 *
 * Séparé de `resolveFulfillmentDomain` à dessein : la décision de repli et
 * la décision de SIGNALER sont deux responsabilités distinctes. Le résolveur
 * doit rester total — toujours rendre un domaine, jamais lever. L'appelant,
 * lui, doit pouvoir tracer une valeur inattendue sans que ce module décide à
 * sa place d'émettre une anomalie.
 *
 * Sans cette séparation, un mode absent ou corrompu se replierait
 * silencieusement sur 'merchant' — sûr, mais invisible. Or une frontière
 * dont les cas limites sont muets est une frontière qu'on découvre trop tard.
 */
export function isRecognisedSiteMode(siteMode: unknown): boolean {
  return siteMode === 1 || siteMode === 2 || siteMode === SUPPLIER_SITE_MODE
}
