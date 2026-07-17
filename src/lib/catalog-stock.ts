import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { cjAdapter } from '@/lib/suppliers/cj-adapter';
import { printfulAdapter } from '@/lib/suppliers/printful-adapter';
import { printifyAdapter } from '@/lib/suppliers/printify-adapter';
import { zendropAdapter } from '@/lib/suppliers/zendrop-adapter';
import type { SupplierAdapter } from '@/lib/suppliers/supplier-adapter';

type CatalogStockLine = {
  realId: string;        // UUID de catalog_products
  variantId?: string;    // variante choisie par l'acheteur (si applicable)
  quantity: number;
};

const ADAPTERS: Record<string, SupplierAdapter> = {
  cj: cjAdapter,
  printful: printfulAdapter,
  printify: printifyAdapter,
  zendrop: zendropAdapter,
};

// Credentials Nexiora globales (le marchand n'a AUCUN compte fournisseur — Phase 2 automatisee)
const CREDS: Record<string, Record<string, string>> = {
  cj: { email: process.env.CJ_EMAIL || '', apiKey: process.env.CJ_API_KEY || '' },
  printful: { printful_token: process.env.PRINTFUL_API_TOKEN || '' },
  printify: { printify_token: process.env.PRINTIFY_API_TOKEN || '', printify_shop_id: process.env.PRINTIFY_SHOP_ID || '' },
  zendrop: {},
};

/**
 * Verifie le stock reel des produits catalog aupres du fournisseur (live).
 * Refuse si une variante choisie est epuisee ou retiree.
 * Le marchand n'interagit jamais avec le fournisseur : cles Nexiora globales.
 */
export async function checkCatalogStock(
  lines: CatalogStockLine[],
  destinationCountry: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
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
  for (const line of lines) {
    const product = products.find((p) => p.id === line.realId);
    if (!product) {
      return { ok: false, reason: 'Produit introuvable.' };
    }

    // Cache dit deja epuise -> refus direct
    if (product.in_stock === false) {
      return { ok: false, reason: `"${product.name}" n'est plus disponible.` };
    }

    const adapter = ADAPTERS[product.supplier_id];
    const creds = CREDS[product.supplier_id];
    if (!adapter || !creds) continue; // fournisseur inconnu -> on ne bloque pas

    // 3. Verification live aupres du fournisseur
    try {
      const result = await adapter.checkStock(
        {
          supplier_product_id: product.supplier_product_id,
          variant_id: line.variantId || product.supplier_product_id,
          quantity: line.quantity,
          destination_country: destinationCountry || 'US',
        },
        creds
      );
      if (!result.available) {
        return { ok: false, reason: `"${product.name}" n'est plus disponible.` };
      }
    } catch (e) {
      // Erreur API fournisseur : on ne bloque PAS la vente (le cache in_stock fait deja garde-fou).
      console.error(`[checkCatalogStock] ${product.supplier_id} echec pour ${product.id}:`, e);
    }
  }

  return { ok: true };
}
