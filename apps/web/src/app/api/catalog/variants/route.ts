import { NextRequest, NextResponse } from 'next/server';
import { suppliersWithCapability } from '@/lib/suppliers/registry';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { usesCatalogSelections } from '@/lib/dropship/catalogAdmission';
import { suppliersForDropshipType, type DropshipType } from '@/lib/dropship/suppliers';
import { consommerJeton } from '@/lib/rate-limit/rateLimit';

// Derive : fournisseurs implementant reellement listVariants (Gelato en
// est absent legitimement — chaque CatalogProduct Gelato est deja la
// variante exacte, voir gelato-adapter.ts). Voir registry.ts.
const VARIANT_SUPPLIERS = new Map(
  suppliersWithCapability('listVariants').map((s) => [s.id, s])
);

// ============================================================
// LOT 6 / DEBT-057 -- CETTE ROUTE ETAIT UN PROXY LIBRE VERS LES CREDENTIALS.
//
// Etat d'origine : deux parametres, aucun slug, aucune authentification,
// aucune admission, aucune limite. `supplier_id` + `supplier_product_id`
// suffisaient a faire appeler CJ ou Printful AVEC NOS CLES, autant de fois
// que voulu, par n'importe qui. Le quota fournisseur et la facture sont a
// nous ; l'appelant n'avait meme pas besoin de connaitre un site.
//
// CE QUI N'EST PAS LA REPONSE. `requireSiteOwner` serait FAUX : les trois
// appelants reels -- fiche produit, ProductModal (recherche catalogue
// visiteur), MerchantProductModal (carte produit du storefront) -- sont des
// surfaces VISITEUR. Exiger une session proprietaire casserait le parcours
// d'achat. Une verification d'`Origin` ne serait pas une reponse non plus :
// un en-tete se forge.
//
// L'ADMISSION EST DERIVEE DE LA DONNEE, EN QUATRE QUESTIONS DEJA POSEES
// AILLEURS, DANS L'ORDRE DU MOINS CHER AU PLUS CHER :
//   1. ce slug designe-t-il un site reel et non archive ?
//   2. ce site utilise-t-il le mecanisme catalogue fournisseur ?
//      -> `usesCatalogSelections`, l'autorite du LOT 2. Elle ecarte d'un coup
//         Mode 1, Mode 2 et `pod_brand`, dont aucun ne liste de variantes.
//   3. ce fournisseur est-il eligible au sous-mode du site ?
//      -> `suppliersForDropshipType`, l'autorite du LOT 4. Un site `reseller`
//         ne fait pas appeler Printful, un `pod_custom` ne fait pas appeler CJ.
//   4. ce produit existe-t-il dans NOTRE catalogue pour ce fournisseur ?
//      -> C'EST LA GARDE ANTI-PROXY. Sans elle, les trois premieres passent
//         avec un slug public (trivialement enumerable) et n'importe quel
//         identifiant produit du fournisseur. Avec elle, on ne parle au
//         fournisseur que d'un produit que Deribfy indexe deja.
//
// PAS D'EXIGENCE DE SELECTION. `merchant_approved` serait une garde FAUSSE
// ici : mesure faite, `/api/catalog/search` sert au visiteur des produits du
// catalogue GLOBAL (branche 2), pas seulement les selections du marchand. La
// fiche produit qui s'ouvre dessus doit pouvoir lister ses variantes. Exiger
// une selection approuvee casserait le parcours reel.
//
// CONTRAT DE REPONSE PRESERVE. Tout refus rend `{ variants: [] }` en plus de
// son statut : les trois appelants lisent `Array.isArray(d.variants)`, donc
// aucun ne change de comportement. Et la regle du LOT 4 tient toujours -- une
// liste vide n'autorise pas l'achat, elle le bloque (`choixDeVarianteRequis`).
// ============================================================

const VIDE = { variants: [] as unknown[] };
const PLAFOND_PAR_MINUTE = 30;

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug') || '';
  const supplierId = req.nextUrl.searchParams.get('supplier_id') || '';
  const supplierProductId = req.nextUrl.searchParams.get('supplier_product_id') || '';

  if (!slug || !supplierId || !supplierProductId) {
    return NextResponse.json({ ...VIDE, error: 'slug, supplier_id et supplier_product_id requis' }, { status: 400 });
  }

  const supplier = VARIANT_SUPPLIERS.get(supplierId);
  if (!supplier || !supplier.adapter.listVariants) {
    return NextResponse.json({ ...VIDE, error: 'Fournisseur inconnu' }, { status: 400 });
  }

  // 1. le site existe reellement, et n'est pas archive.
  const { data: site, error: erreurSite } = await supabaseAdmin
    .from('sites')
    .select('id, mode, dropship_type')
    .eq('slug', slug)
    .is('archived_at', null)
    .maybeSingle();

  if (erreurSite) {
    return NextResponse.json({ ...VIDE, error: 'Service momentanement indisponible.' }, { status: 503 });
  }
  if (!site) {
    return NextResponse.json({ ...VIDE, error: 'Site introuvable' }, { status: 404 });
  }

  // 2. ce site a-t-il un catalogue fournisseur ? (autorite du LOT 2)
  if (!usesCatalogSelections(site.mode, (site as { dropship_type?: unknown }).dropship_type)) {
    return NextResponse.json({ ...VIDE, error: 'Site sans catalogue fournisseur' }, { status: 403 });
  }

  // 3. ce fournisseur est-il eligible a ce sous-mode ? (autorite du LOT 4)
  if (!suppliersForDropshipType((site as { dropship_type?: DropshipType }).dropship_type).includes(supplierId)) {
    return NextResponse.json({ ...VIDE, error: 'Fournisseur hors sous-mode de cette boutique' }, { status: 403 });
  }

  // 4. GARDE ANTI-PROXY : ce produit est-il dans NOTRE catalogue ?
  const { data: produit, error: erreurProduit } = await supabaseAdmin
    .from('catalog_products')
    .select('id')
    .eq('supplier_id', supplierId)
    .eq('supplier_product_id', supplierProductId)
    .maybeSingle();

  if (erreurProduit) {
    return NextResponse.json({ ...VIDE, error: 'Service momentanement indisponible.' }, { status: 503 });
  }
  if (!produit) {
    return NextResponse.json({ ...VIDE, error: 'Produit hors catalogue' }, { status: 404 });
  }

  // 5. limite de debit par site, AVANT toute depense de credential.
  const jeton = await consommerJeton({
    type: 'catalog_variants_request',
    siteId: site.id,
    fenetreMs: 60_000,
    plafond: PLAFOND_PAR_MINUTE,
    message: 'Trop de requetes, reessayez dans une minute.',
    details: { slug, supplier_id: supplierId },
  });
  if (!jeton.ok) {
    return NextResponse.json({ ...VIDE, error: jeton.erreur }, { status: jeton.statut });
  }

  try {
    const variants = await supplier.adapter.listVariants(supplierProductId, supplier.credentials);
    const inStock = variants.filter((v) => v.stock_quantity > 0);
    return NextResponse.json({ variants: inStock });
  } catch (e) {
    console.error('[/api/catalog/variants]', supplierId, e);
    return NextResponse.json(VIDE);
  }
}
