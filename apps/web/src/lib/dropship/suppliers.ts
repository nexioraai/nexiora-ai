// ============================================================
// DEBT-081 -- `import 'server-only'` RETIRE ICI. NE PAS LE REMETTRE.
//
// CE QU'IL CASSAIT. `src/app/sites/[slug]/themes/shared.tsx` est
// BI-ENVIRONNEMENT -- quatre composants 'use client' l'importent -- et il
// importe `selectionServable` depuis `catalogAdmission`. `server-only` entrait
// donc dans un graphe CLIENT, et `next build` echouait avec quatre erreurs.
// Le fichier `shared.tsx` enonce d'ailleurs lui-meme cette contrainte
// (« il ne peut donc pas importer une autorite `server-only` ») quelques
// lignes plus bas : c'est sa propre regle qui etait violee, par son import.
//
// DATE ET CAUSE, MESUREES. Au commit `11b3b52`, `shared.tsx` n'importait pas
// ce module et le build passait. C'est `f5f17ec` -- qui a fait verifier
// l'eligibilite fournisseur a la LECTURE, un correctif juste -- qui a
// introduit l'import et casse le build.
//
// POURQUOI LE RETRAIT EST SANS CONSEQUENCE. Ce module est PUR : aucune E/S,
// aucun `process.env`, aucun secret -- des listes constantes et des
// comparaisons. Le depot expose deja exactement cette classe d'autorite au
// client : `canTransact` (`lib/commerce-admission`), qui repond « ce site
// a-t-il le droit de vendre ? », n'a PAS de `server-only` et est importee par
// `PromoBanner` ('use client'). Et les identifiants fournisseur ne sont pas
// des secrets : `catalog_products.supplier_id` est lisible sous la cle anon
// (verifie : rend « cj »).
//
// L'INTENTION EST CONSERVEE AUTREMENT. Ce module reste l'autorite unique de
// l'admission au catalogue ; ce qui ne devait pas atteindre le client, ce
// sont les SECRETS et les ACCES, pas un predicat. Un cliquet structurel
// (`src/lib/architecture/__tests__/serverOnlyClientGraph.test.ts`) echoue
// desormais si un module du graphe client reprend un `server-only`.
// ============================================================

// ============================================================
// Source UNIQUE : quels fournisseurs sont autorises pour chaque
// sous-type Mode 3. Importe par la curation (curate) ET la recherche
// visiteur (catalog/search) — jamais dupliquer cette regle.
//
// Regle metier stricte :
//   - reseller   : produits finis  -> CJ uniquement
//   - pod_brand  : impression POD   -> Printful + Gelato (jamais CJ)
//   - pod_custom : impression POD   -> Printful + Gelato (jamais CJ)
//   - absent / inconnu : AUCUN fournisseur (LOT 1 / L1-03) -- un sous-type
//     manquant n'est pas un reseller, c'est une donnee absente.
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
      // ============================================================
      // LOT 1 / L1-03 -- CE REPLI RENDAIT `['cj']`, ET IL A SERVI.
      //
      // CE QU'IL FAISAIT. « Le sous-type devrait toujours etre defini »,
      // disait le commentaire precedent -- mais rien ne l'imposait, et pour
      // trois sites de production il ne l'etait pas. Ce `default` decidait
      // alors du fournisseur A LA PLACE DU MARCHAND. Ce n'etait pas une
      // hypothese : ces trois sites portent 12 commandes reelles, toutes en
      // domaine fournisseur, DEUX avec un `cj_order_id`. Le repli a ete
      // exerce en production.
      //
      // POURQUOI « c'est deja garde en amont » NE SUFFISAIT PAS. C'est vrai,
      // et cela reste vrai : les cinq appelants passent par
      // `hasSupplierCatalog(site.mode)`, donc aucun site Mode 1 ou Mode 2
      // n'atteint cette fonction. Mais cette garde protege les AUTRES MODES,
      // pas l'interieur du Mode 3 : elle n'a jamais empeche un site Mode 3
      // sans sous-type d'obtenir le catalogue CJ. Un repli fournisseur ne
      // doit pas devenir une decision implicite de sous-mode.
      //
      // LISTE VIDE = FAIL-CLOSED, et chaque appelant y repond deja
      // correctement, verifie un par un :
      //   catalog/search    `.in('supplier_id', [])`  -> 0 produit
      //   catalog/curate    idem                      -> 0 produit curable
      //   catalog/selections `[].includes(...)`       -> 409, refus
      //   mode3/checkoutPolicy.admitsCatalogSupplier  -> false, refus
      //   cron/catalog-suggest appelle avec 'reseller' litteral -> inchange
      // Aucun n'avait besoin d'etre modifie : ils etaient tous ecrits pour
      // consommer une liste, jamais pour supposer qu'elle est non vide.
      //
      // CONSEQUENCE ASSUMEE, ET C'EST LE POINT. Un site Mode 3 sans
      // sous-type ne vend plus rien du catalogue -- au lieu de vendre du CJ
      // que personne n'a choisi. La regle d'ecriture (`subtypeAdmission`)
      // empeche desormais d'en creer de nouveaux ; les trois existants
      // relevent d'une decision de donnee, pas de code.
      // ============================================================
      return [];
  }
}
