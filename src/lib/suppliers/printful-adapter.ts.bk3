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
} from './supplier-adapter';

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

// ---------- API helper ----------

async function pfFetch(path: string, token: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${PRINTFUL_BASE}${path}`, {
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
  const ids = new Set<number>();
  const lowerNiches = niches.map(n => n.toLowerCase());

  for (const cat of categories) {
    const title = (cat.title || '').toLowerCase();
    for (const niche of lowerNiches) {
      if (title.includes(niche) || niche.includes(title)) {
        ids.add(cat.id);
      }
    }
  }

  // Fallback : si aucun match, prendre les catégories populaires
  if (ids.size === 0 && categories.length > 0) {
    // T-shirts, Posters, Mugs — catégories de base Printful
    categories.slice(0, 5).forEach(c => ids.add(c.id));
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

        // 3. Pour chaque produit, fetch détails + variants (max 8 par catégorie pour le cron)
        for (const prod of (products || []).slice(0, 8)) {
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
            files: order.design_url
              ? [{ type: 'default', url: order.design_url }]
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

      const statusMap: Record<string, TrackingStatus> = {
        draft: 'pending',
        pending: 'processing',
        failed: 'failed',
        canceled: 'failed',
        inprocess: 'processing',
        onhold: 'processing',
        partial: 'shipped',
        fulfilled: 'delivered',
      };

      const shipment = Array.isArray(order.shipments) && order.shipments.length > 0
        ? order.shipments[0]
        : null;

      return {
        supplier_order_id: supplierOrderId,
        status: statusMap[order.status] || 'pending',
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
