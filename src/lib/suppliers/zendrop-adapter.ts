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
  ShippingRequest,
  ShippingResult,
} from './supplier-adapter';

// ============================================================
// Zendrop Adapter — MCP JSON-RPC 2.0
// POST https://app.zendrop.com/mcp/v1
// method: "tools/call", params: { name, arguments }
// Result in response.result.structuredContent
// Rate limits: 120 read/min, 30 write/min, 10 fulfillment/min
// ============================================================

const ZENDROP_MCP_URL = 'https://app.zendrop.com/mcp/v1';
let rpcId = 0;

async function zendropCall(toolName: string, args: Record<string, unknown> = {}): Promise<any> {
  const token = process.env.ZENDROP_API_TOKEN;
  if (!token) throw new Error('ZENDROP_API_TOKEN not set');

  rpcId++;
  const res = await fetch(ZENDROP_MCP_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Nexiora/1.0',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: rpcId,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zendrop ${toolName} HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(`Zendrop ${toolName} RPC error: ${json.error.message}`);
  }

  return json.result?.structuredContent || json.result || {};
}

function mapZendropProduct(p: any): CatalogProduct {
  const imgUrls: string[] = (p.images || []).map((img: any) =>
    typeof img === 'string' ? img : img.url || ''
  ).filter(Boolean);
  if (!imgUrls.length && p.image) imgUrls.push(p.image);

  const variants = (p.variants || []).map((v: any) => ({
    variant_id: String(v.id || v.variant_id || ''),
    name: v.name || v.title || '',
    sku: v.sku || '',
    price: parseFloat(v.price || p.price || '0'),
    stock_quantity: v.stock ?? v.inventory_quantity ?? 999,
    image: v.image || undefined,
  }));

  return {
    supplier_id: 'zendrop',
    supplier_product_id: String(p.id),
    supplier_parent_id: String(p.id),
    name: p.name || p.title || '',
    description: (p.description || '').replace(/<[^>]*>/g, '').slice(0, 500),
    category: p.category || 'General',
    images: imgUrls,
    price: parseFloat(p.price || '0'),
    currency: 'USD',
    variants,
    shipping_days_min: (p.warehouse === 'US' || p.country === 'US' || p.ships_from === 'US') ? 2 : 7,
    shipping_days_max: (p.warehouse === 'US' || p.country === 'US' || p.ships_from === 'US') ? 5 : 15,
    warehouse_country: p.warehouse || p.country || p.ships_from || 'US',
    in_stock: true,
    last_synced_at: new Date().toISOString(),
  };
}

export const zendropAdapter: SupplierAdapter = {
  supplierId: 'zendrop',
  displayName: 'Zendrop',
  warehouseCountries: ['US', 'CN'],
  avgShippingDays: { min: 5, max: 12 },

  async syncCatalog(_options: SyncOptions): Promise<SyncResult> {
    const allProducts: CatalogProduct[] = [];
    // Zendrop search returns entire catalog regardless of keyword.
    // Use category_id pagination for diverse product coverage.
    const categoryIds = [106, 61, 60, 67, 65, 252]; // Electronics, Apparel, Pets, Baby, Arts, Sports
    const pagesPerCat = 5;
    const perPage = 50;

    for (const catId of categoryIds) {
      for (let page = 1; page <= pagesPerCat; page++) {
        try {
          const data = await zendropCall('get_catalog_products', {
            category_id: catId,
            limit: perPage,
            page,
          });
          const products = data.products || [];
          for (const p of products) {
            allProducts.push(mapZendropProduct(p));
          }
          if (products.length < perPage) break;
        } catch (e) {
          console.error(`Zendrop sync cat=${catId} page=${page} error:`, e);
        }
        await new Promise(r => setTimeout(r, 600));
      }
    }
    return {
      products: allProducts,
      total_available: allProducts.length,
      has_more: false,
    };
  },

  async checkStock(
    request: StockCheckRequest,
    _creds: Record<string, string>
  ): Promise<StockCheckResult> {
    try {
      const data = await zendropCall('get_catalog_product', {
        product_id: Number(request.supplier_product_id),
      });

      const product = data.product || data;
      const variant = (product.variants || []).find(
        (v: any) => String(v.id || v.variant_id) === request.variant_id
      );

      const price = parseFloat(variant?.price || product.price || '0');
      const stock = variant?.stock ?? variant?.inventory_quantity ?? 999;

      return {
        available: stock >= request.quantity,
        current_price: price,
        stock_quantity: stock,
        shipping_cost: 0,
        shipping_days_min: 5,
        shipping_days_max: 12,
      };
    } catch {
      return {
        available: false,
        current_price: 0,
        stock_quantity: 0,
        shipping_cost: 0,
        shipping_days_min: 0,
        shipping_days_max: 0,
      };
    }
  },

  async createOrder(
    order: OrderRequest,
    _creds: Record<string, string>
  ): Promise<OrderResult> {
    try {
      const data = await zendropCall('fulfill_order', {
        product_id: Number(order.supplier_product_id),
        variant_id: order.variant_id,
        quantity: order.quantity,
        shipping_address: {
          name: order.shipping_address.full_name,
          address1: order.shipping_address.address_line1,
          address2: order.shipping_address.address_line2 || '',
          city: order.shipping_address.city,
          state: order.shipping_address.province_state,
          zip: order.shipping_address.postal_code,
          country: order.shipping_address.country,
          phone: order.shipping_address.phone,
        },
        merchant_order_id: order.merchant_order_id,
      });

      return {
        success: true,
        supplier_order_id: String(data.order_id || data.id || ''),
        estimated_shipping_days: data.estimated_days || 10,
      };
    } catch (e: any) {
      return {
        success: false,
        supplier_order_id: '',
        estimated_shipping_days: 0,
        error_message: e.message || 'Zendrop order failed',
      };
    }
  },

  async getTracking(
    supplierOrderId: string,
    _creds: Record<string, string>
  ): Promise<TrackingResult> {
    try {
      const data = await zendropCall('get_tracking_events', {
        order_id: supplierOrderId,
      });

      const events = data.events || data.tracking_events || [];
      const statusMap: Record<string, any> = {
        pending: 'pending',
        processing: 'processing',
        shipped: 'shipped',
        in_transit: 'in_transit',
        delivered: 'delivered',
        cancelled: 'failed',
        refunded: 'failed',
      };

      const lastEvent = events[events.length - 1];
      return {
        supplier_order_id: supplierOrderId,
        status: statusMap[lastEvent?.status] || 'pending',
        tracking_number: data.tracking_number || undefined,
        carrier: data.carrier || undefined,
        tracking_url: data.tracking_url || undefined,
        events: events.map((e: any) => ({
          timestamp: e.timestamp || e.date || new Date().toISOString(),
          status: statusMap[e.status] || 'in_transit',
          description: e.description || e.message || '',
          location: e.location || undefined,
        })),
      };
    } catch {
      return {
        supplier_order_id: supplierOrderId,
        status: 'pending',
        events: [],
      };
    }
  },

  async calculateShipping(
    items: ShippingRequest[],
    countryCode: string,
    _creds: Record<string, string>
  ): Promise<ShippingResult> {
    try {
      const firstItem = items[0];
      if (!firstItem) {
        return { total_cost: 0, currency: 'USD', estimated_days_min: 5, estimated_days_max: 12 };
      }

      const data = await zendropCall('get_catalog_shipping_estimate', {
        product_id: Number(firstItem.supplier_product_id),
        destination_country: countryCode,
        quantity: firstItem.quantity,
      });

      const estimates = data.shipping_options || data.estimates || [];
      const standard = estimates.find((e: any) =>
        (e.type || e.method || e.name || '').toLowerCase().includes('standard')
      ) || estimates[0];

      if (standard) {
        return {
          total_cost: parseFloat(standard.cost || standard.price || '0'),
          currency: 'USD',
          estimated_days_min: standard.min_days || standard.estimated_days || 5,
          estimated_days_max: standard.max_days || standard.estimated_days || 12,
        };
      }

      return { total_cost: 0, currency: 'USD', estimated_days_min: 5, estimated_days_max: 12 };
    } catch {
      return { total_cost: 0, currency: 'USD', estimated_days_min: 5, estimated_days_max: 12 };
    }
  },
};
