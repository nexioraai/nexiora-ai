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
