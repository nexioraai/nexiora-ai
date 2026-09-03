import 'server-only';

// ============================================================
// LOT 1 / L1-01 -- LA REGLE D'ECRITURE DU SOUS-TYPE.
//
// LE DEFAUT MESURE. Rien, nulle part, n'exigeait qu'un site Mode 3 porte un
// sous-type. `isValidDropshipType` (api/chat/route.ts) repondait « cette
// valeur est-elle ecrivable ? » SANS CONNAITRE LE MODE : elle acceptait
// `null` pour tout le monde. L'entretien d'onboarding, lui, retombe sur
// `null` des que le modele ne detecte pas de sous-type clair. Les deux
// ensemble produisent un Mode 3 sans sous-type, et c'est arrive :
// 3 sites de production dans cet etat, dont UN PUBLIE, portant ensemble
// 12 commandes reelles et 2 `cj_order_id`. Le repli fournisseur n'etait donc
// pas dormant -- il a decide d'un fournisseur a la place du marchand.
//
// CE MODULE NE CREE PAS UNE QUATRIEME AUTORITE. Le depot en portait trois,
// et le LOT 1 a mesure qu'AUCUNE n'etait defectueuse :
//   `isValidDropshipType`      -- quelle VALEUR est ecrivable
//   `CATALOG_SUBTYPES`         -- quels sous-types ont les OUTILS
//   `suppliersForDropshipType` -- quels FOURNISSEURS sont admis
// Aucune ne repond a « ce COUPLE (mode, sous-type) est-il ecrivable ? »,
// parce que personne ne posait la question. C'est celle-ci, et elle seule,
// qui vit ici. Le vocabulaire des sous-types y est defini UNE fois :
// `isValidDropshipType` en devient un mince adaptateur, pour qu'il n'existe
// jamais deux listes de sous-types valides.
//
// POURQUOI ICI. `mode-3-supplier-domain` se decrit lui-meme comme portant
// « le registre fournisseur, le moteur transactionnel de soumissions et LA
// REGLE DE SOUS-TYPE » : ce module est chez lui, pas a cote.
//
// `unknown` PARTOUT, comme les trois autres primitives d'admission du depot
// (`canTransact`, `hasSupplierCatalog`, `getToolsForSite`) : ces valeurs
// viennent de colonnes et de corps de requete, jamais d'un contrat
// TypeScript. `Set.has` compare strictement -- la chaine '3' n'est pas le
// nombre 3, `'RESELLER'` n'est pas `'reseller'`, et `''` n'est rien.
// ============================================================

export type DropshipSubtype = 'reseller' | 'pod_brand' | 'pod_custom';

/**
 * LE VOCABULAIRE, source unique. Tout ce qui n'y figure pas litteralement
 * n'est pas un sous-type -- `null`, `undefined`, `''`, `'RESELLER'`,
 * `'pod-brand'`, `0`, un objet.
 */
const DROPSHIP_SUBTYPES = new Set<unknown>(['reseller', 'pod_brand', 'pod_custom']);

/**
 * Les modes de site pour lesquels un sous-type est OBLIGATOIRE.
 *
 * ALLOWLIST POSITIVE, meme forme que `TRANSACTING_SITE_MODES` et
 * `CATALOG_SITE_MODES`. Un mode ajoute demain n'herite pas de l'obligation
 * par accident : l'y inscrire sera une decision d'une ligne, visible en diff.
 */
const SUBTYPE_REQUIRED_MODES = new Set<unknown>([3]);

/** Cette valeur est-elle un sous-type connu ? */
export function isKnownDropshipSubtype(value: unknown): value is DropshipSubtype {
  return DROPSHIP_SUBTYPES.has(value);
}

/** Ce mode de site exige-t-il un sous-type ? */
export function requiresDropshipSubtype(siteMode: unknown): boolean {
  return SUBTYPE_REQUIRED_MODES.has(siteMode);
}

export type SubtypeResolution =
  | { ok: true; value: DropshipSubtype | null }
  | { ok: false; reason: 'subtype_required' };

/**
 * QUELLE VALEUR DE SOUS-TYPE CE SITE PEUT-IL PERSISTER ?
 *
 * Repond par une VALEUR, pas par un booleen, et c'est delibere : un appelant
 * qui recoit `true` doit encore decider quoi ecrire, et c'est exactement la
 * ou les replis silencieux naissent. Ici la decision est prise une fois.
 *
 * DEUX DIRECTIONS, DEUX TRAITEMENTS, ET ILS NE SONT PAS SYMETRIQUES :
 *
 *   MODE QUI EXIGE UN SOUS-TYPE, valeur absente ou inconnue -> REFUS.
 *     C'est la direction dangereuse, celle qui a produit les 3 sites : elle
 *     est fail-closed, sans exception et sans repli. Aucun `reseller`
 *     devine, aucune valeur par defaut.
 *
 *   MODE QUI N'EN EXIGE PAS, valeur presente -> `null`.
 *     Le sous-type n'a aucun sens hors du mode qui l'admet ; le persister
 *     laisserait une donnee inerte que les couches aval pourraient un jour
 *     lire. Ce n'est PAS un repli permissif : c'est un retrait, la direction
 *     sure. Un refus, ici, casserait un flux legitime -- le client conserve
 *     le sous-type choisi dans son etat local (`OnboardingChat`,
 *     `effectiveDsType`) et peut l'envoyer avec un mode finalement classe 1
 *     ou 2 par le modele. On refuse ce qui est dangereux, on ignore ce qui
 *     est sans objet.
 */
export function resolvePersistedSubtype(siteMode: unknown, value: unknown): SubtypeResolution {
  if (requiresDropshipSubtype(siteMode)) {
    return isKnownDropshipSubtype(value) ? { ok: true, value } : { ok: false, reason: 'subtype_required' };
  }
  return { ok: true, value: null };
}
