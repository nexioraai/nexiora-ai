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
// Printify — Supplier Adapter Implementation
// Print-on-demand : T-shirts, mugs, posters, phone cases, etc.
// API : https://api.printify.com/v1/
// Rate limit : 120 req/min
// Structure : blueprint → print_provider → variants
// syncCatalog : token Nexiora (global catalog)
// createOrder / getTracking : token + shop_id
// ============================================================

const PRINTIFY_BASE = 'https://api.printify.com/v1';

// ---------- API helper ----------

async function pyFetch(path: string, token: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${PRINTIFY_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Nexiora/1.0',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Printify ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ---------- Niche → blueprint matching ----------

const NICHE_BLUEPRINT_MAP: Record<string, number[]> = {
  // Apparel
  'clothing': [5, 6, 12, 9, 10],
  'fashion': [5, 6, 12, 9, 10],
  'apparel': [5, 6, 12, 9, 10],
  't-shirt': [5, 6, 12],
  'tshirt': [5, 6, 12],
  // Accessories
  'accessories': [474, 476, 477, 478],
  'phone': [474, 476],
  'electronics': [474, 476, 477, 478],
  // Home & Living
  'home': [527, 528, 529, 530],
  'mug': [527, 528],
  'poster': [529, 530],
  'art': [529, 530],
  // Default popular
  'default': [5, 6, 12, 527, 474],
};

function getBlueprintIdsForNiche(niches: string[]): number[] {
  const ids = new Set<number>();
  const lowerNiches = niches.map(n => n.toLowerCase());

  for (const niche of lowerNiches) {
    for (const [key, bpIds] of Object.entries(NICHE_BLUEPRINT_MAP)) {
      if (niche.includes(key) || key.includes(niche)) {
        bpIds.forEach(id => ids.add(id));
      }
    }
  }

  // Fallback
  if (ids.size === 0) {
    NICHE_BLUEPRINT_MAP['default'].forEach(id => ids.add(id));
  }

  return Array.from(ids);
}

// ---------- Provider selection ----------

/** Pick best provider for a blueprint: prefer US-based, then cheapest. */
async function pickProvider(
  token: string,
  blueprintId: number
): Promise<{ id: number; title: string } | null> {
  try {
    const providers = await pyFetch(
      `/catalog/blueprints/${blueprintId}/print_providers.json`,
      token
    );
    if (!Array.isArray(providers) || providers.length === 0) return null;
    // Prefer first provider (Printify orders by relevance)
    return { id: providers[0].id, title: providers[0].title || '' };
  } catch {
    return null;
  }
}

// ---------- Product mapping ----------

function mapPrintifyVariant(
  blueprint: any,
  provider: any,
  variant: any
): CatalogProduct {
  const price = Number(variant.cost) / 100 || 0; // Printify prices in cents

  return {
    supplier_id: 'printify',
    supplier_product_id: `${blueprint.id}_${provider.id}_${variant.id}`,
    name: `${blueprint.title} — ${variant.title || 'Default'}`,
    description: blueprint.description || blueprint.title || '',
    category: '',
    images: blueprint.images || [],
    price,
    currency: 'USD',
    variants: [{
      variant_id: String(variant.id),
      name: variant.title || 'Default',
      sku: variant.sku || '',
      price,
      stock_quantity: variant.is_enabled ? 9999 : 0,
    }],
    shipping_days_min: provider?.handling_time?.min || variant?.handling_time?.min || 3,
    shipping_days_max: (provider?.handling_time?.max || variant?.handling_time?.max || 5) + 3,
    warehouse_country: provider?.location?.country || 'US',
    in_stock: variant.is_enabled !== false,
    last_synced_at: new Date().toISOString(),
  };
}

// ============================================================
// Adapter
// ============================================================

export const printifyAdapter: SupplierAdapter = {
  supplierId: 'printify',
  displayName: 'Printify',
  warehouseCountries: ['US', 'EU', 'AU'],
  avgShippingDays: { min: 3, max: 7 },

  // ---- SYNC (token plateforme) ----
  async syncCatalog(options: SyncOptions): Promise<SyncResult> {
    const token = process.env.PRINTIFY_API_TOKEN || '';
    if (!token) return { products: [], total_available: 0, has_more: false };

    const blueprintIds = getBlueprintIdsForNiche(options.categories);
    const products: CatalogProduct[] = [];

    for (const bpId of blueprintIds) {
      try {
        // 1. Get blueprint info
        const blueprint = await pyFetch(`/catalog/blueprints/${bpId}.json`, token);
        await delay(600);

        // 2. Pick best provider
        const provider = await pickProvider(token, bpId);
        if (!provider) continue;
        await delay(600);

        // 3. Get variants for this provider
        const variantData = await pyFetch(
          `/catalog/blueprints/${bpId}/print_providers/${provider.id}/variants.json`,
          token
        );
        await delay(600);

        const variants = variantData?.variants || [];

        // Deduplicate: pick first enabled variant per blueprint+provider
        const seen = new Set<string>();
        for (const v of variants) {
          if (!v.is_enabled) continue;
          const key = `${bpId}_${provider.id}_${v.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          products.push(mapPrintifyVariant(blueprint, provider, v));
          if (products.length >= (options.page_size || 50)) break;
        }
      } catch (err: any) {
        console.error(`[printify/sync] Blueprint ${bpId} failed:`, err.message || err);
      }
    }

    return {
      products,
      total_available: products.length,
      has_more: false,
    };
  },

  // ---- STOCK CHECK ----
  async checkStock(
    request: StockCheckRequest,
    creds: Record<string, string>
  ): Promise<StockCheckResult> {
    const token = creds['printify_token'] || process.env.PRINTIFY_API_TOKEN || '';
    // supplier_product_id format: blueprintId_providerId_variantId
    const parts = request.supplier_product_id.split('_');
    if (parts.length < 3) {
      return { available: false, current_price: 0, stock_quantity: 0, shipping_cost: 0, shipping_days_min: 3, shipping_days_max: 7 };
    }
    const [bpId, providerId, variantId] = parts;

    try {
      const variantData = await pyFetch(
        `/catalog/blueprints/${bpId}/print_providers/${providerId}/variants.json`,
        token
      );
      const variants = variantData?.variants || [];
      const variant = variants.find((v: any) => String(v.id) === variantId);
      if (!variant) {
        return { available: false, current_price: 0, stock_quantity: 0, shipping_cost: 0, shipping_days_min: 3, shipping_days_max: 7 };
      }

      // Shipping
      let shippingCost = 0;
      try {
        const shippingData = await pyFetch(
          `/catalog/blueprints/${bpId}/print_providers/${providerId}/shipping.json`,
          token
        );
        const profiles = shippingData?.profiles || [];
        const dest = request.destination_country;
        for (const profile of profiles) {
          const countries = profile.countries || [];
          if (countries.includes(dest) || countries.includes('REST_OF_THE_WORLD')) {
            shippingCost = Number(profile.first_item?.cost || 0) / 100;
            break;
          }
        }
      } catch {}

      return {
        available: variant.is_enabled !== false,
        current_price: Number(variant.cost) / 100 || 0,
        stock_quantity: variant.is_enabled ? 9999 : 0,
        shipping_cost: shippingCost,
        shipping_days_min: 3,
        shipping_days_max: 7,
      };
    } catch {
      return { available: false, current_price: 0, stock_quantity: 0, shipping_cost: 0, shipping_days_min: 3, shipping_days_max: 7 };
    }
  },

  // ---- CREATE ORDER (token + shop_id) ----
  async createOrder(
    order: OrderRequest,
    creds: Record<string, string>
  ): Promise<OrderResult> {
    const token = creds['printify_token'] || process.env.PRINTIFY_API_TOKEN || '';
    const shopId = creds['printify_shop_id'] || process.env.PRINTIFY_SHOP_ID || '';
    if (!shopId) {
      return { success: false, supplier_order_id: '', estimated_shipping_days: 0, error_message: 'Missing Printify shop_id' };
    }

    // supplier_product_id format: blueprintId_providerId_variantId
    const parts = order.supplier_product_id.split('_');
    if (parts.length < 3) {
      return { success: false, supplier_order_id: '', estimated_shipping_days: 0, error_message: 'Invalid supplier_product_id format' };
    }
    const [blueprintId, printProviderId, variantId] = parts;

    try {
      const pyOrder = await pyFetch(`/shops/${shopId}/orders.json`, token, {
        method: 'POST',
        body: JSON.stringify({
          external_id: order.merchant_order_id,
          label: {
            name: order.shipping_address.full_name,
            email: '',
            phone: order.shipping_address.phone,
            country: order.shipping_address.country,
            region: order.shipping_address.province_state,
            address1: order.shipping_address.address_line1,
            address2: order.shipping_address.address_line2 || '',
            city: order.shipping_address.city,
            zip: order.shipping_address.postal_code,
          },
          line_items: [{
            blueprint_id: Number(blueprintId),
            print_provider_id: Number(printProviderId),
            variant_id: Number(variantId),
            quantity: order.quantity,
            print_areas: order.design_url
              ? { front: { src: order.design_url } }
              : { front: '' },
          }],
        }),
      });

      return {
        success: true,
        supplier_order_id: String(pyOrder.id || ''),
        estimated_shipping_days: 7,
      };
    } catch (e: any) {
      return {
        success: false,
        supplier_order_id: '',
        estimated_shipping_days: 0,
        error_message: e.message || 'Printify order failed',
      };
    }
  },

  // ---- TRACKING ----
  async getTracking(
    supplierOrderId: string,
    creds: Record<string, string>
  ): Promise<TrackingResult> {
    const token = creds['printify_token'] || process.env.PRINTIFY_API_TOKEN || '';
    const shopId = creds['printify_shop_id'] || process.env.PRINTIFY_SHOP_ID || '';

    try {
      const order = await pyFetch(`/shops/${shopId}/orders/${supplierOrderId}.json`, token);
      const statusMap: Record<string, TrackingStatus> = {
        'pending': 'pending',
        'on-hold': 'processing',
        'sending-to-production': 'processing',
        'in-production': 'processing',
        'shipping': 'shipped',
        'fulfilled': 'delivered',
        'canceled': 'failed',
      };
      const shipment = Array.isArray(order.shipments) && order.shipments.length > 0
        ? order.shipments[0]
        : null;

      return {
        supplier_order_id: supplierOrderId,
        status: statusMap[order.status] || 'pending',
        tracking_number: shipment?.tracking_number || undefined,
        carrier: shipment?.carrier || undefined,
        tracking_url: shipment?.tracking_url || undefined,
        events: [],
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
    const token = creds['printify_token'] || process.env.PRINTIFY_API_TOKEN || '';
    let totalCost = 0;
    let found = false;

    for (const item of items) {
      // supplier_product_id format: blueprintId_providerId_variantId
      const parts = item.supplier_product_id.split('_');
      if (parts.length < 3) continue;
      const [bpId, providerId] = parts;

      try {
        const shippingData = await pyFetch(
          `/catalog/blueprints/${bpId}/print_providers/${providerId}/shipping.json`,
          token
        );
        const profiles = shippingData?.profiles || [];

        for (const profile of profiles) {
          const countries = profile.countries || [];
          if (countries.includes(countryCode) || countries.includes('REST_OF_THE_WORLD')) {
            const firstCost = Number(profile.first_item?.cost || 0) / 100;
            const addlCost = Number(profile.additional_items?.cost || 0) / 100;
            totalCost += firstCost + (item.quantity > 1 ? addlCost * (item.quantity - 1) : 0);
            found = true;
            break;
          }
        }
      } catch (err: any) {
        console.error('[printify/calculateShipping]', err.message || err);
      }
    }

    if (!found) throw new Error('not_available');

    return {
      total_cost: Math.round(totalCost * 100) / 100,
      currency: 'USD',
      estimated_days_min: 3,
      estimated_days_max: 7,
    };
  },
};
