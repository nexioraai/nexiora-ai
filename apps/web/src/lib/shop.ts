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
  /**
   * ÉTAPE 5 — politique d'inventaire (colonne `shop_products.track_inventory`,
   * `NOT NULL DEFAULT true`, introduite à l'étape 1).
   *
   * `false` = vente sans compteur : `stock` devient inerte et ne doit être
   * ni lu, ni comparé, ni décrémenté. Exposée ici parce que `checkStock()`
   * en a besoin ; volontairement ABSENTE de `ShopProductInput` — la
   * réactivation du suivi passe par `enable_stock_tracking()` (étape 3),
   * jamais par un patch générique.
   */
  track_inventory: boolean;
  published: boolean;
  /**
   * ÉTAPE 8, VOLET A — ACHETABILITÉ (colonne `shop_products.for_sale`,
   * `NOT NULL DEFAULT true`).
   *
   * Distincte de `published`, qui ne porte plus que la VISIBILITÉ. Jusqu'à ce
   * volet, `published` faisait les deux : un marchand ne pouvait ni exposer
   * un produit sans le vendre, ni le retirer de la vente sans le faire
   * disparaître de sa vitrine, de sa fiche produit ET du sitemap.
   *
   * Le défaut vit en base, PAS ici. `ShopProductInput.for_sale` est optionnel
   * et `createProduct` n'envoie que les champs fournis : un appelant qui omet
   * le champ obtient `true` du DEFAULT PostgreSQL. Redéclarer cette valeur en
   * TypeScript créerait une seconde source de vérité pour une même règle.
   */
  for_sale: boolean;
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
  /**
   * ÉTAPE 8, VOLET A — OPTIONNEL, et il doit le rester. Omettre ce champ
   * laisse PostgreSQL appliquer `DEFAULT true` ; lui donner une valeur de
   * repli ici ferait du TypeScript une seconde autorité sur le défaut.
   * Contrairement à `track_inventory`, `for_sale` est admis dans les
   * allowlists génériques : il ne déclare rien sur un état antérieur, donc
   * n'exige ni preuve, ni horodatage, ni acte dédié.
   */
  for_sale?: boolean;
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

/**
 * ETAPE 7 du chantier catalogue canonique -- LES DEUX SEULES ECRITURES DE
 * `track_inventory` DE TOUT LE TYPESCRIPT.
 *
 * Elles sont ici, et non dans la route, parce que `shop.ts` est le module
 * unique d'acces a `shop_products` : une route qui importerait
 * `supabaseAdmin` directement pour ecrire dans cette table serait la
 * divergence, pas la regle.
 */

export type EnableStockTrackingResult =
  | { ok: true; stock: number; stock_counted_at: string | null }
  | { ok: false; reason: string; transport?: true };

/**
 * Active le suivi de stock EN AFFIRMANT UN COMPTAGE.
 *
 * Passe OBLIGATOIREMENT par `enable_stock_tracking()` (etape 3), jamais par un
 * `update({ track_inventory: true })`. La raison n'est pas stylistique : la
 * barriere `trg_enforce_stock_tracking_requires_count` (etape 2) refuse toute
 * transition false -> true qui ne fait pas AVANCER STRICTEMENT
 * `stock_counted_at`. Seule la RPC pose les trois colonnes dans la meme
 * instruction, avec `clock_timestamp()` -- `now()` est fige par transaction et
 * ne pourrait donc pas avancer deux fois dans une meme transaction.
 *
 * La RPC ne leve jamais : elle rend `{ success: false, reason }`. Ce wrapper
 * RELAIE ce resultat sans le reinterpreter -- il ne rejoue aucune regle
 * metier, ne devine aucune cause, n'inspecte pas `track_inventory` avant
 * l'appel. La base est l'autorite ; le TypeScript n'est qu'un transport.
 */
export async function enableStockTracking(
  productId: string,
  units: number
): Promise<EnableStockTrackingResult> {
  const { data, error } = await supabaseAdmin.rpc('enable_stock_tracking', {
    p_product_id: productId,
    p_stock: units,
  });

  // Erreur de TRANSPORT (reseau, droits, fonction absente) -- distincte d'un
  // refus metier : elle ne dit rien de la legitimite de la demande.
  if (error) {
    console.error('enableStockTracking RPC error:', error.message);
    return { ok: false, reason: error.message, transport: true };
  }
  if (!data || data.success !== true) {
    return { ok: false, reason: data?.reason || 'unknown' };
  }
  return { ok: true, stock: data.stock, stock_counted_at: data.stock_counted_at ?? null };
}

/**
 * Cesse de suivre le stock d'un produit.
 *
 * `track_inventory` SEUL. `stock_counted_at` n'est jamais efface ni modifie :
 * c'est la trace du dernier comptage reellement affirme par un humain, et
 * l'effacer detruirait la seule preuve dont la barriere de reactivation se
 * sert. Le compteur `stock` n'est pas remis a zero non plus -- il devient
 * inerte (`checkStock` cesse de le lire), il ne devient pas faux.
 *
 * Aucune RPC ici : la transition true -> false est LIBRE cote base (la
 * barriere ne s'oppose qu'a la reactivation). Lui inventer un garde-fou
 * applicatif reviendrait a dupliquer une decision que la base a deja prise.
 */
export async function disableStockTracking(productId: string): Promise<ShopProduct> {
  const { data, error } = await supabaseAdmin
    .from('shop_products')
    .update({ track_inventory: false })
    .eq('id', productId)
    .select('*')
    .single();
  if (error) throw new Error(`disableStockTracking: ${error.message}`);
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
 *
 * NON AUTORITATIF (F7) : cette vérification a lieu à la création du checkout,
 * avant l'envoi vers Stripe — elle sert uniquement à éviter d'envoyer un
 * acheteur payer un produit déjà visiblement épuisé (UX). Le stock peut
 * changer entre cet appel et la confirmation du paiement (autre acheteur,
 * webhook traité plus tard) : la seule garantie réelle est appliquée par
 * decrementStock() au paiement confirmé, via une fonction Postgres atomique.
 */
export async function checkStock(
  lines: StockLine[]
): Promise<{ ok: true } | { ok: false; reason: string }> {
  for (const line of lines) {
    if (line.id.startsWith("catalog-")) continue;
    const product = await getProduct(line.id);
    if (!product) return { ok: false, reason: `Produit introuvable` };
    // ÉTAPE 5 — le compteur ne fait autorité que sur un produit SUIVI.
    // Un produit `track_inventory = false` est vendu sans compteur : son
    // `stock` est inerte (souvent 0) et le refuser ici rendrait la vente sans
    // inventaire impossible. La base applique déjà cette sémantique depuis
    // l'étape 4 (`decrement_shop_stock_batch` ignore ces lignes, sans erreur
    // ni marquage) ; cette pré-vérification s'aligne dessus.
    //
    // `!== false` ET NON `=== true`, délibérément. Si `track_inventory`
    // venait à manquer de la lecture (select restreint, donnée partielle),
    // son absence doit rendre ce contrôle PLUS STRICT, jamais plus permissif :
    // une pré-vérification plus permissive que le décrément ferait encaisser
    // l'acheteur puis déclencher un remboursement automatique intégral
    // (handlePaidCheckout). Trop strict = vente perdue ; trop permissif =
    // argent encaissé puis rendu. Les deux directions ne se valent pas.
    if (product.track_inventory !== false && product.stock < line.quantity) {
      return { ok: false, reason: `Stock insuffisant pour "${product.name}" (${product.stock} disponible)` };
    }
  }
  return { ok: true };
}

export type StockDecrementResult =
  | { ok: true }
  | { ok: false; reason: string; productId?: string };

/**
 * Décrémente le stock des produits achetés — appelé UNIQUEMENT au paiement
 * confirmé (handlePaidCheckout), jamais à la création du checkout.
 *
 * F7 : remplace l'ancien lecture-puis-calcul-JS-puis-écriture (non atomique,
 * "lost update" démontré possible sous concurrence — deux commandes
 * différentes décrémentant le même produit en parallèle pouvaient en perdre
 * une). Délègue la décrémentation entière à decrement_shop_stock_batch()
 * (supabase/sql/shop_stock_functions.sql), une fonction Postgres : c'est la
 * seule façon d'obtenir une décrémentation réellement atomique avec
 * PostgREST, qui n'accepte que des valeurs littérales dans un .update(),
 * jamais une expression relative à la valeur actuelle de la ligne
 * ("stock = stock - quantité").
 *
 * Tout ou rien pour la commande entière : si un seul produit manque de
 * stock, aucun n'est décrémenté (transaction annulée côté Postgres,
 * démontré dans le corps de la fonction SQL) — jamais d'état partiellement
 * décrémenté sur une commande multi-produits.
 *
 * F9/F10 : orderId (optionnel) fait marquer atomiquement, dans la MÊME
 * transaction SQL que la décrémentation elle-même, les lignes
 * shop_order_items réellement décrémentées (stock_decremented = true) —
 * seule source de vérité utilisée ensuite par cancelShopOrderAtomic() pour
 * restaurer exactement ce qui a été décrémenté, jamais une ré-dérivation à
 * la volée depuis l'état courant de shop_products (voir le commentaire de
 * decrement_shop_stock_batch dans le fichier SQL pour le raisonnement
 * complet). handlePaidCheckout est le seul appelant qui passe orderId ; tout
 * appel qui l'omet garde le comportement F7 strictement inchangé.
 */
export async function decrementStock(lines: StockLine[], orderId?: string): Promise<StockDecrementResult> {
  const shopLines = lines.filter((l) => !l.id.startsWith('catalog-'));
  if (shopLines.length === 0) return { ok: true };

  const { data, error } = await supabaseAdmin.rpc('decrement_shop_stock_batch', {
    p_lines: shopLines.map((l) => ({ product_id: l.id, quantity: l.quantity })),
    ...(orderId ? { p_order_id: orderId } : {}),
  });

  if (error) {
    console.error('decrementStock RPC error:', error.message);
    return { ok: false, reason: error.message };
  }
  if (!data || data.success !== true) {
    return {
      ok: false,
      reason: data?.reason || 'unknown',
      productId: data?.product_id,
    };
  }
  return { ok: true };
}

export type CancelOrderStockResult =
  | { ok: true; restocked: false }
  | { ok: true; restocked: true; paymentIntentId: string | null }
  | { ok: false; reason: string };

/**
 * F9/F10 : transition atomique d'une commande vers 'canceled', et --
 * uniquement si elle était réellement 'paid' -- restauration atomique
 * tout-ou-rien du stock exactement décrémenté pour cette commande, dans la
 * MÊME transaction Postgres que la transition de statut (cancel_shop_order,
 * supabase/sql/shop_stock_functions.sql). Voir l'en-tête de cette fonction
 * SQL pour la démonstration complète de pourquoi une lecture JS préalable du
 * statut ne suffit jamais sous course avec le webhook de paiement.
 *
 * `restocked` distingue les deux issues valides : false = la commande était
 * 'pending' (rien à restaurer, rien à rembourser) ; true = elle était
 * 'paid', le stock vient d'être restauré, et `paymentIntentId` (lu
 * fraîchement dans la même transaction, jamais une valeur lue par
 * l'appelant avant cet appel) doit être remboursé par l'appelant.
 * `ok:false` couvre à la fois une commande non annulable (déjà
 * canceled/refunded/shipped/delivered, ou course perdue contre une
 * transition concurrente) et une erreur RPC/réseau — jamais un throw.
 */
export async function cancelShopOrderAtomic(orderId: string): Promise<CancelOrderStockResult> {
  const { data, error } = await supabaseAdmin.rpc('cancel_shop_order', { p_order_id: orderId });

  if (error) {
    console.error('cancelShopOrderAtomic RPC error:', error.message);
    return { ok: false, reason: error.message };
  }
  if (!data || data.success !== true) {
    return { ok: false, reason: data?.reason || 'unknown' };
  }
  if (data.restocked === true) {
    return { ok: true, restocked: true, paymentIntentId: data.payment_intent_id ?? null };
  }
  return { ok: true, restocked: false };
}
