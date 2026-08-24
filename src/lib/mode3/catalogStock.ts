import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { suppliersWithCapability } from '@/lib/suppliers/registry';
import { logAnomaly } from '@/lib/anomaly';

type CatalogStockLine = {
  realId: string;        // UUID de catalog_products
  variantId?: string;    // variante choisie par l'acheteur (si applicable)
  quantity: number;
};

// Derive : tout fournisseur qui implemente reellement checkStock est
// verifiable ici, sans liste recopiee a la main (cause du bug ou Gelato,
// pourtant capable, etait absent de ce fichier — voir registry.ts).
// Credentials Nexiora globales (le marchand n'a AUCUN compte fournisseur — Phase 2 automatisee)
const CHECK_STOCK_SUPPLIERS = new Map(
  suppliersWithCapability('checkStock').map((s) => [s.id, s])
);

/**
 * Verifie le stock reel des produits catalog aupres du fournisseur (live).
 * Refuse si une variante choisie est epuisee ou retiree.
 * Le marchand n'interagit jamais avec le fournisseur : cles Nexiora globales.
 */
export async function checkCatalogStock(
  lines: CatalogStockLine[],
  destinationCountry: string,
  strict = false
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // strict = mode 3 : Nexiora avance l'argent au fournisseur.
  // Toute incertitude (API muette, variante absente) devient un refus.
  if (lines.length === 0) return { ok: true };

  // 1. Charger les produits catalog concernes
  const ids = lines.map((l) => l.realId).filter(Boolean);
  const { data: products } = await supabaseAdmin
    .from('catalog_products')
    .select('id, supplier_id, supplier_product_id, in_stock, name')
    .in('id', ids);

  if (!products || products.length === 0) {
    return { ok: false, reason: 'Produit introuvable.' };
  }

  // 2. Verifier chaque ligne
  // CJ limite a 1 requete/seconde : on espace les appels.
  let firstCall = true;
  for (const line of lines) {
    if (!firstCall) await new Promise((r) => setTimeout(r, 1100));
    firstCall = false;
    const product = products.find((p) => p.id === line.realId);
    if (!product) {
      return { ok: false, reason: 'Produit introuvable.' };
    }

    // Cache dit deja epuise -> refus direct
    if (product.in_stock === false) {
      return { ok: false, reason: `"${product.name}" n'est plus disponible.` };
    }

    const supplier = CHECK_STOCK_SUPPLIERS.get(product.supplier_id);
    if (!supplier) {
      if (strict) {
        // Mode 3 : un produit dont le supplier_id ne resout plus vers aucun
        // fournisseur enregistre bloque une vente en silence — c'est
        // exactement le mecanisme qui a cause le bug Gelato (produit
        // autorise mais absent du registre de verification). Anomalie
        // structuree pour que ce cas soit visible avant de redevenir un
        // incident decouvert a posteriori.
        await logAnomaly({
          type: 'catalog_supplier_unavailable',
          details: { productId: product.id, supplierId: product.supplier_id },
        });
        return { ok: false, reason: `"${product.name}" n'est pas disponible a la vente.` };
      }
      continue; // mode 2 : fournisseur inconnu -> on ne bloque pas
    }

    // 3. Verification live aupres du fournisseur
    try {
      const result = await supplier.adapter.checkStock(
        {
          supplier_product_id: product.supplier_product_id,
          variant_id: line.variantId || product.supplier_product_id,
          // NB : sans variantId explicite, les fournisseurs a variantes rejettent l'appel.
          quantity: line.quantity,
          destination_country: destinationCountry || 'US',
        },
        supplier.credentials
      );
      if (!result.available) {
        return { ok: false, reason: `"${product.name}" n'est plus disponible.` };
      }
    } catch (e) {
      console.error(`[checkCatalogStock] ${product.supplier_id} echec pour ${product.id}:`, e);
      if (strict) {
        // Mode 3 : Nexiora avancerait l'argent sans confirmation fournisseur
        // reelle — vente refusee, et l'echec API doit rester visible (pas
        // seulement en console) puisqu'une vente est perdue a cause de lui.
        await logAnomaly({
          type: 'catalog_stock_check_failed',
          details: { productId: product.id, supplierId: product.supplier_id, reason: e instanceof Error ? e.message : String(e) },
        });
        return { ok: false, reason: `Stock non confirme pour "${product.name}".` };
      }
      // Mode 2 : le cache in_stock fait deja garde-fou.
    }
  }

  return { ok: true };
}
