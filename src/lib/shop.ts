import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Helpers boutique (B0) — UTILISER UNIQUEMENT CÔTÉ SERVEUR.
 * CRUD sur shop_products via le client admin (bypass RLS).
 */

export type ShopProduct = {
  id: string;
  site_id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  images: string[];
  stock: number;
  published: boolean;
  position: number;
  created_at: string;
};

export type ShopProductInput = {
  site_id: string;
  name: string;
  description?: string | null;
  price?: number;
  currency?: string;
  images?: string[];
  stock?: number;
  published?: boolean;
  position?: number;
};

/** Liste les produits publiés d'un site (affichage boutique). */
export async function getPublishedProducts(siteId: string): Promise<ShopProduct[]> {
  const { data, error } = await supabaseAdmin
    .from('shop_products')
    .select('*')
    .eq('site_id', siteId)
    .eq('published', true)
    .order('position', { ascending: true });
  if (error) throw new Error(`getPublishedProducts: ${error.message}`);
  return (data ?? []) as ShopProduct[];
}

/** Liste TOUS les produits d'un site (gestion admin). */
export async function getAllProducts(siteId: string): Promise<ShopProduct[]> {
  const { data, error } = await supabaseAdmin
    .from('shop_products')
    .select('*')
    .eq('site_id', siteId)
    .order('position', { ascending: true });
  if (error) throw new Error(`getAllProducts: ${error.message}`);
  return (data ?? []) as ShopProduct[];
}

/** Récupère un produit par id. */
export async function getProduct(id: string): Promise<ShopProduct | null> {
  const { data, error } = await supabaseAdmin
    .from('shop_products')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getProduct: ${error.message}`);
  return (data as ShopProduct) ?? null;
}

/** Crée un produit. */
export async function createProduct(input: ShopProductInput): Promise<ShopProduct> {
  const { data, error } = await supabaseAdmin
    .from('shop_products')
    .insert(input)
    .select('*')
    .single();
  if (error) throw new Error(`createProduct: ${error.message}`);
  return data as ShopProduct;
}

/** Met à jour un produit. */
export async function updateProduct(
  id: string,
  patch: Partial<ShopProductInput>
): Promise<ShopProduct> {
  const { data, error } = await supabaseAdmin
    .from('shop_products')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateProduct: ${error.message}`);
  return data as ShopProduct;
}

/** Supprime un produit. */
export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('shop_products')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`deleteProduct: ${error.message}`);
}

/** Élément de panier minimal pour le contrôle de stock. */
export type StockLine = { id: string; quantity: number };

/**
 * Vérifie que chaque produit a un stock suffisant.
 * Retourne { ok: true } ou { ok: false, reason } avec le premier produit en défaut.
 */
export async function checkStock(
  lines: StockLine[]
): Promise<{ ok: true } | { ok: false; reason: string }> {
  for (const line of lines) {
    const product = await getProduct(line.id);
    if (!product) return { ok: false, reason: `Produit introuvable` };
    if (product.stock < line.quantity) {
      return { ok: false, reason: `Stock insuffisant pour "${product.name}" (${product.stock} disponible)` };
    }
  }
  return { ok: true };
}

/**
 * Décrémente le stock des produits achetés (appelé au paiement confirmé).
 * Best-effort : ne jette pas, log en cas d'erreur sur une ligne.
 */
export async function decrementStock(lines: StockLine[]): Promise<void> {
  for (const line of lines) {
    const product = await getProduct(line.id);
    if (!product) {
      console.error(`decrementStock: produit ${line.id} introuvable`);
      continue;
    }
    const newStock = Math.max(0, product.stock - line.quantity);
    const { error } = await supabaseAdmin
      .from('shop_products')
      .update({ stock: newStock })
      .eq('id', line.id);
    if (error) console.error(`decrementStock ${line.id}: ${error.message}`);
  }
}
