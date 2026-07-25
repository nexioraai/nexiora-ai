import 'server-only';

// ============================================================
// Source UNIQUE : quels fournisseurs sont autorises pour chaque
// sous-type Mode 3. Importe par la curation (curate) ET la recherche
// visiteur (catalog/search) — jamais dupliquer cette regle.
//
// Regle metier stricte :
//   - reseller   : produits finis  -> CJ uniquement
//   - pod_brand  : impression POD   -> Printful + Gelato (jamais CJ)
//   - pod_custom : impression POD   -> Printful + Gelato (jamais CJ)
//
// Une boutique pod_brand ne doit JAMAIS afficher un produit CJ (reseller),
// et inversement : un produit CJ ne peut pas recevoir le logo du marchand,
// et un blank POD n'a pas de sens dans une boutique reseller.
// ============================================================

export type DropshipType = 'reseller' | 'pod_brand' | 'pod_custom' | null | undefined;

const RESELLER_SUPPLIERS = ['cj'] as const;
const POD_SUPPLIERS = ['printful', 'gelato'] as const;

/** Retourne la liste des supplier_id autorises pour un sous-type donne.
 *  Sert a filtrer catalog_products aussi bien en curation qu'en recherche. */
export function suppliersForDropshipType(dropshipType: DropshipType): string[] {
  switch (dropshipType) {
    case 'reseller':
      return [...RESELLER_SUPPLIERS];
    case 'pod_brand':
    case 'pod_custom':
      return [...POD_SUPPLIERS];
    default:
      // Sous-type inconnu / non renseigne : par securite, aucun melange.
      // On retombe sur reseller (comportement historique = CJ) plutot que
      // d'exposer tout le catalogue. Le sous-type devrait toujours etre defini.
      return [...RESELLER_SUPPLIERS];
  }
}
