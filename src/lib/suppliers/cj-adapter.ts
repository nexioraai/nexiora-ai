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

import { cjSearchProductsV2, cjGetInventory, cjCalculateFreight, cjCreateOrder, cjGetOrderDetail, cjGetVariants } from '../cj/client';

// ============================================================
// CJ Dropshipping — Supplier Adapter Implementation
// syncCatalog : clés Nexiora (globales)
// checkStock / createOrder / getTracking : clés du marchand
// ============================================================

const NEXIORA_CJ_EMAIL = process.env.CJ_EMAIL!;
const NEXIORA_CJ_API_KEY = process.env.CJ_API_KEY!;

/** Parse le prix CJ (peut être '8.79 -- 9.95' ou un nombre). Retourne le min. */
function parseCjPrice(raw: any): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const match = raw.match(/([\d.]+)/);
    return match ? parseFloat(match[1]) : 0;
  }
  return 0;
}

/** Mappe un produit CJ brut vers CatalogProduct unifié. */
function mapCjProduct(raw: any): CatalogProduct {
  const variants = Array.isArray(raw.variants)
    ? raw.variants.map((v: any) => ({
        variant_id: v.vid || v.variantId || '',
        name: v.variantNameEn || v.variantName || '',
        sku: v.variantSku || v.productSku || '',
        price: Number(v.variantSellPrice ?? v.sellPrice ?? 0),
        stock_quantity: Number(v.variantVolume ?? 0),
        image: v.variantImage || undefined,
      }))
    : [];

  return {
    supplier_id: 'cj',
    supplier_product_id: raw.pid || raw.id || raw.productId || '',
    name: raw.productNameEn || raw.nameEn || raw.productName || '',
    description: raw.description || raw.productNameEn || raw.nameEn || '',
    category: raw.categoryName || raw.categoryNameEn || raw.categoryId || '',
    images: [raw.productImage, raw.bigImage, ...(raw.productImageList || [])].filter(Boolean),
    price: parseCjPrice(raw.sellPrice ?? raw.productPrice ?? 0),
    currency: 'USD',
    variants,
    shipping_days_min: raw.logisticAging?.min ?? 10,
    shipping_days_max: raw.logisticAging?.max ?? 20,
    warehouse_country: raw._warehouseCountry || 'CN',
    in_stock: true,
    last_synced_at: new Date().toISOString(),
  };
}

/** Mappe le statut CJ vers TrackingStatus unifié. */
function mapCjStatus(cjStatus: string): TrackingStatus {
  const s = (cjStatus || '').toUpperCase();
  if (s.includes('DELIVER') || s.includes('COMPLET')) return 'delivered';
  if (s.includes('SHIP') || s.includes('DISPATCH')) return 'shipped';
  if (s.includes('TRANSIT')) return 'in_transit';
  if (s.includes('PROCESS') || s.includes('PACKING')) return 'processing';
  if (s.includes('CANCEL') || s.includes('FAIL')) return 'failed';
  return 'pending';
}

export const cjAdapter: SupplierAdapter = {
  supplierId: 'cj',
  displayName: 'CJ Dropshipping',
  warehouseCountries: ['CN', 'US', 'DE', 'TH'],
  avgShippingDays: { min: 10, max: 20 },

  // ---- CRON (clés Nexiora) ----
  async syncCatalog(options: SyncOptions): Promise<SyncResult> {
    const pageSize = 200;
    const maxPages = 3;
    const allProducts: CatalogProduct[] = [];
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Double pass: global (CN) + US warehouse
    const passes: { countryCode?: string; warehouseTag: string }[] = [
      { warehouseTag: 'CN' },
      { countryCode: 'US', warehouseTag: 'US' },
    ];

    for (const pass of passes) {
      for (const category of options.categories) {
        for (let page = 1; page <= maxPages; page++) {
          await delay(1200);
          const data = await cjSearchProductsV2(NEXIORA_CJ_EMAIL, NEXIORA_CJ_API_KEY, {
            keyWord: category,
            page,
            size: pageSize,
            countryCode: pass.countryCode,
          });

          const rawList = data?.content?.[0]?.productList ?? data?.content ?? data?.list ?? [];
          // Tag each raw product with the warehouse country for this pass
          const tagged = rawList.map((r: any) => ({ ...r, _warehouseCountry: pass.warehouseTag }));
          const mapped = tagged.map(mapCjProduct);
          allProducts.push(...mapped);
          if (rawList.length < pageSize) break;
        }
      }
    }

    const totalRecords = allProducts.length;

    return {
      products: allProducts,
      total_available: totalRecords,
      has_more: false,
      next_page: undefined,
    };
  },

  // ---- VARIANTES (live, cles Nexiora globales) ----
  async listVariants(
    supplierProductId: string,
    creds: Record<string, string>
  ): Promise<ProductVariant[]> {
    // Compte CJ Nexiora, jamais celui d'un marchand : le parametre creds est
    // impose par l'interface SupplierAdapter mais ignore pour CJ.
    const email = NEXIORA_CJ_EMAIL;
    const apiKey = NEXIORA_CJ_API_KEY;
    try {
      const variants = await cjGetVariants(email, apiKey, supplierProductId);
      if (!Array.isArray(variants)) return [];
      return variants.map((v: any) => ({
        variant_id: String(v.vid),
        name: v.variantNameEn || v.variantName || v.variantSku || String(v.vid),
        sku: v.variantSku || '',
        price: Number(v.variantSellPrice ?? v.sellPrice ?? 0),
        stock_quantity: Number(v.variantQuantity ?? 999),
        image: v.variantImage || undefined,
      }));
    } catch {
      return [];
    }
  },

  // ---- CHECKOUT (clés du marchand) ----
  async checkStock(
    request: StockCheckRequest,
    creds: Record<string, string>
  ): Promise<StockCheckResult> {
    const { email, apiKey } = creds as { email: string; apiKey: string };

    const stockQty = await cjGetInventory(email, apiKey, request.variant_id);

    let shippingCost = 0;
    let shippingMin = 10;
    let shippingMax = 20;

    try {
      const freight = await cjCalculateFreight(email, apiKey, request.destination_country, [
        { vid: request.variant_id, quantity: request.quantity },
      ]);
      if (Array.isArray(freight) && freight.length > 0) {
        const best = freight[0];
        shippingCost = Number(best.estimateFreight ?? best.logisticPrice ?? 0);
        shippingMin = Number(best.logisticAging?.split('-')?.[0] ?? 10);
        shippingMax = Number(best.logisticAging?.split('-')?.[1] ?? 20);
      }
    } catch {
      // Freight indisponible — on garde les defaults
    }

    // Prix live via variants
    let currentPrice = 0;
    try {
      const variants = await cjGetVariants(email, apiKey, request.supplier_product_id);
      const match = Array.isArray(variants)
        ? variants.find((v: any) => v.vid === request.variant_id)
        : null;
      currentPrice = Number(match?.variantSellPrice ?? match?.sellPrice ?? 0);
    } catch {
      // Fallback — le prix sera vérifié via le cache
    }

    return {
      available: stockQty >= request.quantity,
      current_price: currentPrice,
      stock_quantity: stockQty,
      shipping_cost: shippingCost,
      shipping_days_min: shippingMin,
      shipping_days_max: shippingMax,
    };
  },

  // ---- POST-PAIEMENT (clés du marchand) ----
  async createOrder(
    order: OrderRequest,
    creds: Record<string, string>
  ): Promise<OrderResult> {
    const { email, apiKey } = creds as { email: string; apiKey: string };

    const cjPayload = {
      orderNumber: order.merchant_order_id,
      shippingZip: order.shipping_address.postal_code,
      shippingCountryCode: order.shipping_address.country,
      shippingCountry: order.shipping_address.country,
      shippingProvince: order.shipping_address.province_state,
      shippingCity: order.shipping_address.city,
      shippingAddress: order.shipping_address.address_line1,
      shippingAddress2: order.shipping_address.address_line2 || '',
      shippingCustomerName: order.shipping_address.full_name,
      shippingPhone: order.shipping_address.phone,
      products: [
        {
          vid: order.variant_id,
          quantity: order.quantity,
        },
      ],
    };

    try {
      const data = await cjCreateOrder(email, apiKey, cjPayload);
      return {
        success: true,
        supplier_order_id: data?.orderId || data?.orderNum || '',
        estimated_shipping_days: 15,
      };
    } catch (e: any) {
      return {
        success: false,
        supplier_order_id: '',
        estimated_shipping_days: 0,
        error_message: e.message,
      };
    }
  },

  // ---- TRACKING (clés du marchand) ----
  async getTracking(
    supplierOrderId: string,
    creds: Record<string, string>
  ): Promise<TrackingResult> {
    const { email, apiKey } = creds as { email: string; apiKey: string };

    const detail = await cjGetOrderDetail(email, apiKey, supplierOrderId);

    if (!detail) {
      return {
        supplier_order_id: supplierOrderId,
        status: 'pending',
        events: [],
      };
    }

    return {
      supplier_order_id: supplierOrderId,
      status: mapCjStatus(detail.orderStatus || ''),
      tracking_number: detail.trackNumber || detail.trackingNumber || undefined,
      carrier: detail.logisticName || undefined,
      tracking_url: detail.trackNumber
        ? `https://t.17track.net/en#nums=${detail.trackNumber}`
        : undefined,
      events: [],
    };
  },

  // ---- SHIPPING UNIVERSEL ----
  async calculateShipping(
    items: ShippingRequest[],
    countryCode: string,
    creds: Record<string, string>
  ): Promise<ShippingResult> {
    // Compte CJ Nexiora, jamais celui d'un marchand.
    const email = NEXIORA_CJ_EMAIL;
    const apiKey = NEXIORA_CJ_API_KEY;

    // Resoudre les vid pour chaque item
    const cjProducts: { vid: string; quantity: number }[] = [];
    // CJ limite a 1 requete/seconde : on espace les appels et on retente une fois.
    let first = true;
    for (const item of items) {
      if (!first) await new Promise((r) => setTimeout(r, 1100));
      first = false;
      let variants: any = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          variants = await cjGetVariants(email, apiKey, item.supplier_product_id);
          break;
        } catch (e: any) {
          const msg = String(e?.message || e);
          if (attempt === 0 && msg.includes('Too Many Requests')) {
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }
          console.error('[cj/calculateShipping] getVariants echec', item.supplier_product_id, msg);
        }
      }
      const vid = Array.isArray(variants) && variants.length > 0
        ? (variants[0].vid || variants[0].variantId)
        : null;
      if (vid) cjProducts.push({ vid, quantity: item.quantity });
    }

    if (cjProducts.length === 0) {
      throw new Error('not_available');
    }

    const options = await cjCalculateFreight(email, apiKey, countryCode, cjProducts);
    const list = Array.isArray(options) ? options : [];
    const prices = list
      .map((o: any) => Number(o?.logisticPrice ?? o?.price ?? o?.freightAmount))
      .filter((n: number) => Number.isFinite(n) && n >= 0);

    if (prices.length === 0) {
      throw new Error('not_available');
    }

    const cheapest = Math.min(...prices);
    const best = list.find((o: any) => Number(o?.logisticPrice ?? o?.price ?? o?.freightAmount) === cheapest);
    const aging = best?.logisticAging || '';
    const match = aging.match(/(\d+)\s*-\s*(\d+)/);

    return {
      total_cost: Math.round(cheapest * 100) / 100,
      currency: 'USD',
      estimated_days_min: match ? Number(match[1]) : 7,
      estimated_days_max: match ? Number(match[2]) : 15,
    };
  },
};
