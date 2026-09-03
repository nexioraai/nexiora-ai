import 'server-only';

import type {
  SupplierAdapter,
  SyncOptions,
  SyncResult,
  CatalogProduct,
  StockCheckRequest,
  StockCheckResult,
  OrderRequest,
  OrderResult,
  TrackingResult,
  TrackingStatus,
  ShippingRequest,
  ShippingResult,
  ProductVariant,
} from './supplier-adapter';
import { fetchWithTimeout } from '@/lib/http/fetchWithTimeout';

// ============================================================
// Printful — Supplier Adapter Implementation
// Print-on-demand : T-shirts, mugs, posters, accessories
// Warehouses : US, CA, MX, EU, JP, BR, AU
// API : https://api.printful.com/ (REST, Bearer token)
// Rate limit : 120/min (auth), 30/60s (no auth catalog)
// syncCatalog : token Nexiora (global)
// checkStock / createOrder / getTracking : token marchand
// ============================================================

const PRINTFUL_BASE = 'https://api.printful.com';

// Extrait de getTracking() (comportement inchangé) pour être réutilisable
// par le module de normalisation du fulfillment (P0-3.7 Phase 7 —
// responsabilité de normalisation unique par fournisseur).
export const PRINTFUL_TRACKING_STATUS_MAP: Record<string, TrackingStatus> = {
  draft: 'pending',
  pending: 'processing',
  failed: 'failed',
  canceled: 'failed',
  inprocess: 'processing',
  onhold: 'processing',
  partial: 'shipped',
  fulfilled: 'delivered',
};

// ---------- API helper ----------

async function pfFetch(path: string, token: string, init?: RequestInit): Promise<any> {
  const res = await fetchWithTimeout(`${PRINTFUL_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(process.env.PRINTFUL_STORE_ID ? { 'X-PF-Store-Id': process.env.PRINTFUL_STORE_ID } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Printful ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.result;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ---------- Niche → category matching ----------

/** Fetch toutes les catégories Printful, retourne celles qui matchent nos keywords. */
async function findCategoryIds(token: string, niches: string[]): Promise<number[]> {
  const raw = await pfFetch('/categories', token);
  const categories: any[] = raw?.categories || raw || [];

  // Univers des catégories-feuilles vendables : on écarte les regroupements
  // qui ne sont pas des types imprimables (racines de l'arbre, marques,
  // collections marketing, doublons « All … »), et tout parent ayant des enfants.
  const BRANDS_PARENT = 159;      // Bella+Canvas, Gildan, adidas…
  const COLLECTIONS_PARENT = 116; // Sportswear, Bestsellers, 4th of July…
  const GENERIC = /^all\b|^all-over\b/i;
  const parentIds = new Set<number>(categories.map(c => Number(c.parent_id)));
  const sellable = categories.filter(c => {
    const id = Number(c.id);
    const parent = Number(c.parent_id);
    const title = String(c.title || '');
    if (parent === 0) return false;                 // enfants directs de la racine = gros parents
    if (parent === BRANDS_PARENT) return false;
    if (parent === COLLECTIONS_PARENT) return false;
    if (GENERIC.test(title)) return false;
    if (parentIds.has(id)) return false;            // a des enfants → pas une feuille
    return true;
  });

  // Match niche → titre de feuille par MOT entier (évite « art » ⊂ « Cartes »).
  const ids = new Set<number>();
  // Normalisation singulier/pluriel : les titres Printful sont au pluriel
  // (« Mugs », « Beanies », « Socks »), les niches souvent au singulier.
  // On compare en retirant un « s » final de part et d'autre, tout en gardant
  // le match par mot entier (donc « art » ne matche pas « Cartes »).
  const singular = (w: string) => w.endsWith('s') ? w.slice(0, -1) : w;
  const niceWords = niches.map(n => singular(n.toLowerCase().trim())).filter(Boolean);
  for (const cat of sellable) {
    const titleWords = String(cat.title || '')
      .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(singular);
    for (const niche of niceWords) {
      if (titleWords.includes(niche)) { ids.add(Number(cat.id)); break; }
    }
  }

  // Fallback cohérent : socle POD universel (T-shirts, Hoodies, Sweatshirts,
  // Mugs, Posters, Tote bags, Tank tops, Beanies — IDs vérifiés 2026-07),
  // restreint aux feuilles réellement présentes. Jamais les parents fourre-tout.
  if (ids.size === 0) {
    const BASELINE = [24, 28, 29, 195, 55, 48, 23, 45];
    const sellableIds = new Set(sellable.map(c => Number(c.id)));
    for (const id of BASELINE) if (sellableIds.has(id)) ids.add(id);
    if (ids.size === 0) sellable.slice(0, 8).forEach(c => ids.add(Number(c.id)));
  }

  return Array.from(ids);
}

// ---------- Product mapping ----------

function mapPrintfulVariant(product: any, variant: any): CatalogProduct {
  const fulfillDays = Number(product.avg_fulfillment_time) || 4;

  return {
    supplier_id: 'printful',
    // Chez Printful, c'est le variant_id qui est commandable
    supplier_product_id: String(variant.id),
    supplier_parent_id: String(product.id),
    name: `${product.title || product.type_name || 'Printful'} — ${variant.color || ''} ${variant.size || ''}`.trim(),
    description: product.description || product.title || '',
    category: product.type_name || product.type || '',
    images: [variant.image, product.image].filter(Boolean),
    price: parseFloat(variant.price) || 0,
    currency: 'USD',
    variants: [{
      variant_id: String(variant.id),
      name: variant.name || `${variant.color || ''} / ${variant.size || ''}`.trim(),
      sku: `PF-${variant.id}`,
      price: parseFloat(variant.price) || 0,
      stock_quantity: variant.in_stock ? 9999 : 0,
      image: variant.image || undefined,
    }],
    // fulfillment (production) + shipping NA
    shipping_days_min: fulfillDays,
    shipping_days_max: fulfillDays + 4,
    warehouse_country: 'US',
    in_stock: variant.in_stock !== false,
    last_synced_at: new Date().toISOString(),
  };
}

// ---------- Adapter ----------

/** Credentials plateforme Nexiora pour Printful — jamais par marchand. */
export const printfulCredentials: Record<string, string> = {
  printful_token: process.env.PRINTFUL_API_TOKEN || '',
};

export const printfulAdapter: SupplierAdapter = {
  supplierId: 'printful',
  displayName: 'Printful',
  warehouseCountries: ['US', 'CA', 'MX', 'EU', 'JP', 'BR', 'AU'],
  avgShippingDays: { min: 4, max: 8 },

  // ---- CRON (token Nexiora) ----
  async syncCatalog(options: SyncOptions): Promise<SyncResult> {
    const token = process.env.PRINTFUL_API_TOKEN || '';
    const allProducts: CatalogProduct[] = [];

    // 1. Trouver les catégories Printful qui matchent nos niches
    const categoryIds = await findCategoryIds(token, options.categories);

    // 2. Pour chaque catégorie, fetch les produits
    for (const catId of categoryIds) {
      await delay(600); // rate limit : 120/min → ~500ms entre appels
      try {
        const products: any[] = await pfFetch(
          `/products?category_id=${catId}`,
          token
        );

        // 3. Pour chaque produit, fetch détails + variants (max 20 par catégorie pour le cron)
        for (const prod of (products || []).slice(0, 20)) {
          if (prod.is_discontinued) continue;
          await delay(600);
          try {
            const detail = await pfFetch(`/products/${prod.id}`, token);
            const product = detail.product || prod;
            const variants: any[] = detail.variants || [];

            // Ne garder que les variants en stock dans les régions NA
            for (const v of variants) {
              if (v.in_stock === false) continue;
              const price = parseFloat(v.price);
              if (!price || price <= 0) continue;
              allProducts.push(mapPrintfulVariant(product, v));
            }
          } catch (e) {
            console.error(`[Printful] product ${prod.id}:`, e);
          }
        }
      } catch (e) {
        console.error(`[Printful] category ${catId}:`, e);
      }
    }

    // Dédupliquer par supplier_product_id (variant_id)
    const seen = new Set<string>();
    const unique = allProducts.filter(p => {
      if (seen.has(p.supplier_product_id)) return false;
      seen.add(p.supplier_product_id);
      return true;
    });

    return {
      products: unique,
      total_available: unique.length,
      has_more: false,
      next_page: undefined,
    };
  },

  // ---- CHECKOUT (token marchand) ----
  async listVariants(
    supplierProductId: string,
    creds: Record<string, string>
  ): Promise<ProductVariant[]> {
    const token = creds['printful_token'] || process.env.PRINTFUL_API_TOKEN || '';
    try {
      const data = await pfFetch(`/products/variant/${supplierProductId}`, token);
      const v = data?.variant;
      if (!v) return [];
      return [{
        variant_id: String(supplierProductId),
        name: v.name || v.size || 'Standard',
        sku: v.product?.name || '',
        price: parseFloat(v.price) || 0,
        stock_quantity: v.in_stock !== false ? 9999 : 0,
        image: v.image || undefined,
      }];
    } catch {
      return [];
    }
  },

  async checkStock(
    request: StockCheckRequest,
    creds: Record<string, string>
  ): Promise<StockCheckResult> {
    const token = creds['printful_token'] || process.env.PRINTFUL_API_TOKEN || '';

    try {
      const data = await pfFetch(`/products/variant/${request.supplier_product_id}`, token);
      const variant = data?.variant;
      const price = parseFloat(variant?.price) || 0;

      // Shipping via /shipping/rates
      let shippingCost = 0;
      let shippingMin = 4;
      let shippingMax = 8;
      try {
        const rates = await pfFetch('/shipping/rates', token, {
          method: 'POST',
          body: JSON.stringify({
            recipient: { country_code: request.destination_country },
            items: [{ variant_id: Number(request.supplier_product_id), quantity: request.quantity }],
          }),
        });
        if (Array.isArray(rates) && rates.length > 0) {
          const standard = rates.find((r: any) => r.id === 'STANDARD') || rates[0];
          shippingCost = parseFloat(standard.rate) || 0;
          shippingMin = Number(standard.minDeliveryDays) || 4;
          shippingMax = Number(standard.maxDeliveryDays) || 8;
        }
      } catch {
        // Shipping indisponible — garder defaults
      }

      return {
        available: variant?.in_stock !== false,
        current_price: price,
        stock_quantity: variant?.in_stock ? 9999 : 0,
        shipping_cost: shippingCost,
        shipping_days_min: shippingMin,
        shipping_days_max: shippingMax,
      };
    } catch {
      return {
        available: false,
        current_price: 0,
        stock_quantity: 0,
        shipping_cost: 0,
        shipping_days_min: 4,
        shipping_days_max: 8,
      };
    }
  },

  // ---- POST-PAIEMENT (token marchand) ----
  async createOrder(
    order: OrderRequest,
    creds: Record<string, string>
  ): Promise<OrderResult> {
    const token = creds['printful_token'] || process.env.PRINTFUL_API_TOKEN || '';

    try {
      const pfOrder = await pfFetch('/orders?confirm=true', token, {
        method: 'POST',
        body: JSON.stringify({
          external_id: order.merchant_order_id,
          recipient: {
            name: order.shipping_address.full_name,
            address1: order.shipping_address.address_line1,
            address2: order.shipping_address.address_line2 || '',
            city: order.shipping_address.city,
            state_code: order.shipping_address.province_state,
            country_code: order.shipping_address.country,
            zip: order.shipping_address.postal_code,
            phone: order.shipping_address.phone,
          },
          items: [{
            variant_id: Number(order.supplier_product_id),
            quantity: order.quantity,
            files: Array.isArray(order.design_files) && order.design_files.length > 0
              ? order.design_files.map(f => ({
                  type: f.placement || 'default',
                  url: f.url,
                  ...(f.position ? { position: f.position } : {}),
                }))
              : order.design_url
                ? [{
                    type: order.design_placement || 'default',
                    url: order.design_url,
                    ...(order.design_position ? { position: order.design_position } : {}),
                  }]
                : [],
          }],
        }),
      });

      return {
        success: true,
        supplier_order_id: String(pfOrder.id || pfOrder.external_id || ''),
        estimated_shipping_days: 7,
      };
    } catch (e: any) {
      return {
        success: false,
        supplier_order_id: '',
        estimated_shipping_days: 0,
        error_message: e.message || 'Printful order failed',
      };
    }
  },

  // ---- TRACKING (token marchand) ----
  async getTracking(
    supplierOrderId: string,
    creds: Record<string, string>
  ): Promise<TrackingResult> {
    const token = creds['printful_token'] || process.env.PRINTFUL_API_TOKEN || '';

    try {
      const order = await pfFetch(`/orders/${supplierOrderId}`, token);

      const shipment = Array.isArray(order.shipments) && order.shipments.length > 0
        ? order.shipments[0]
        : null;

      return {
        supplier_order_id: supplierOrderId,
        status: PRINTFUL_TRACKING_STATUS_MAP[order.status] || 'pending',
        tracking_number: shipment?.tracking_number ? String(shipment.tracking_number) : undefined,
        carrier: shipment?.carrier || undefined,
        tracking_url: shipment?.tracking_url || undefined,
        events: shipment?.shipped_at
          ? [{
              timestamp: new Date(shipment.shipped_at * 1000).toISOString(),
              status: 'shipped' as TrackingStatus,
              description: `Shipped via ${shipment.carrier || shipment.service || 'carrier'}`,
            }]
          : [],
      };
    } catch {
      return {
        supplier_order_id: supplierOrderId,
        status: 'pending',
        events: [],
      };
    }
  },

  // ---- SHIPPING UNIVERSEL ----
  async calculateShipping(
    items: ShippingRequest[],
    countryCode: string,
    creds: Record<string, string>
  ): Promise<ShippingResult> {
    const token = creds['printful_token'] || process.env.PRINTFUL_API_TOKEN || '';

    try {
      const pfItems = items.map((i) => ({
        variant_id: Number(i.supplier_product_id),
        quantity: i.quantity,
      }));

      const rates = await pfFetch('/shipping/rates', token, {
        method: 'POST',
        body: JSON.stringify({
          recipient: { country_code: countryCode, state_code: creds['state_code'] || '' },
          items: pfItems,
        }),
      });

      if (Array.isArray(rates) && rates.length > 0) {
        const standard = rates.find((r: any) => r.id === 'STANDARD') || rates[0];
        return {
          total_cost: Math.round((parseFloat(standard.rate) || 0) * 100) / 100,
          currency: 'USD',
          estimated_days_min: Number(standard.minDeliveryDays) || 4,
          estimated_days_max: Number(standard.maxDeliveryDays) || 8,
        };
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('ships to')) {
        console.warn('[printful/calculateShipping] Product not available in this country');
        throw new Error('not_available');
      }
      console.error('[printful/calculateShipping]', msg);
    }

    return { total_cost: 0, currency: 'USD', estimated_days_min: 4, estimated_days_max: 8 };
  },
};
