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
// Gelato — Supplier Adapter Implementation
// Print-on-demand, reseau de production LOCALE dans 30+ pays
// (delais courts par fulfillment de proximite).
// API : REST, auth header X-API-KEY, sous-domaines dedies.
//   catalogue : product.gelatoapis.com/v3
//   commandes : order.gelatoapis.com/v3 (quote) puis v2 (create)
//   statut    : api.gelato.com/v2/order/status
// Flux commande : quote v3 (prix + shipping + deliveryPromiseId)
//   -> create v2 (contre le promise) -> status v2 (tracking).
// Le quote sert de garde-fou : prix produit ET shipping reels
// connus AVANT de creer la commande (regle « jamais absorber un cout »).
// ============================================================

const PRODUCT_BASE = 'https://product.gelatoapis.com';
const ORDER_BASE = 'https://order.gelatoapis.com';
const STATUS_BASE = 'https://api.gelato.com';

const NEXIORA_GELATO_KEY = process.env.GELATO_API_KEY || '';

async function glFetch(base: string, path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': NEXIORA_GELATO_KEY,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gelato ${res.status} ${path}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// Gelato expose 62 catalogues (1 par type de produit). On ne retient que les
// catalogues vendables en B2C, on ecarte le B2B/paperasse (brochures, cartes
// de visite, en-tetes, enveloppes, echantillons...).
const GELATO_POD_CATALOGS = [
  't-shirts', 'hoodies', 'sweatshirts', 'tank-tops', 'polos', 'apparel', 'kids-apparel',
  'beanies', 'bucket-hat', 'dad-hat', 'snapback', 'trucker-hat',
  'mugs', 'bottles', 'tote-bags', 'phone-cases', 'aprons', 'notebooks',
  'posters', 'framed-posters', 'canvas', 'framed-canvas', 'acrylic', 'metallic', 'wood-prints', 'fine-art',
];

// Mapping niche (mot-cle generique) -> catalogues Gelato pertinents.
const NICHE_TO_CATALOGS: Record<string, string[]> = {
  fitness: ['t-shirts', 'tank-tops', 'hoodies', 'bottles'],
  gym: ['t-shirts', 'tank-tops', 'hoodies', 'bottles'],
  yoga: ['tank-tops', 'apparel', 'bottles', 'tote-bags'],
  sport: ['t-shirts', 'tank-tops', 'hoodies', 'bottles'],
  workout: ['t-shirts', 'tank-tops', 'bottles'],
  running: ['t-shirts', 'tank-tops', 'bottles'],
  cafe: ['mugs', 'bottles', 'aprons'],
  coffee: ['mugs', 'bottles', 'aprons'],
  kitchen: ['mugs', 'aprons', 'tote-bags'],
  tea: ['mugs', 'bottles'],
  art: ['posters', 'canvas', 'framed-posters', 'fine-art', 'acrylic'],
  poster: ['posters', 'framed-posters', 'canvas'],
  deco: ['canvas', 'posters', 'framed-canvas', 'metallic', 'wood-prints'],
  wall: ['posters', 'canvas', 'framed-posters'],
  photo: ['canvas', 'posters', 'metallic', 'wood-prints'],
  fashion: ['t-shirts', 'hoodies', 'sweatshirts', 'beanies'],
  streetwear: ['t-shirts', 'hoodies', 'sweatshirts', 'beanies', 'snapback'],
  clothing: ['t-shirts', 'hoodies', 'sweatshirts', 'polos'],
  hat: ['beanies', 'bucket-hat', 'dad-hat', 'snapback', 'trucker-hat'],
  cap: ['dad-hat', 'snapback', 'trucker-hat'],
  kids: ['kids-apparel', 'apparel'],
  baby: ['kids-apparel', 'apparel'],
  bag: ['tote-bags'],
  phone: ['phone-cases'],
  tech: ['phone-cases', 'notebooks'],
};

const GELATO_POD_BASELINE = ['t-shirts', 'hoodies', 'mugs', 'posters', 'tote-bags'];

/** Resout une liste de niches en catalogues Gelato pertinents (dedupliques). */
function resolveCatalogs(niches: string[]): string[] {
  const singular = (w: string) => w.endsWith('s') ? w.slice(0, -1) : w;
  const set = new Set<string>();
  for (const raw of niches) {
    const n = singular(String(raw || '').toLowerCase().trim());
    const mapped = NICHE_TO_CATALOGS[n];
    if (mapped) mapped.forEach(c => set.add(c));
  }
  if (set.size === 0) GELATO_POD_BASELINE.forEach(c => set.add(c));
  return [...set].filter(c => GELATO_POD_CATALOGS.includes(c));
}

/** Mappe un produit Gelato + son prix vers CatalogProduct. */
function mapGelatoProduct(raw: any, catalogUid: string, price: number, currency: string): CatalogProduct {
  const a = raw.attributes || {};
  const titleParts = [
    a.ApparelManufacturer && a.ApparelManufacturer !== 'none' ? a.ApparelManufacturer : '',
    a.GarmentSubcategory && a.GarmentSubcategory !== 'none' ? a.GarmentSubcategory : catalogUid,
    a.GarmentColor || '',
    a.GarmentSize || '',
  ].filter(Boolean);
  const name = titleParts.join(' ').trim() || catalogUid;
  return {
    supplier_id: 'gelato',
    supplier_product_id: raw.productUid,
    supplier_parent_id: catalogUid,
    name,
    description: '',
    category: catalogUid,
    images: [],
    price,
    currency,
    variants: [{
      variant_id: raw.productUid,
      name,
      sku: raw.productUid,
      price,
      stock_quantity: 9999,
      image: undefined,
    }],
    shipping_days_min: 3,
    shipping_days_max: 8,
    warehouse_country: 'LOCAL',
    in_stock: true,
    last_synced_at: new Date().toISOString(),
  };
}

/** Mappe le statut Gelato vers TrackingStatus unifie. */
function mapGelatoStatus(status: string): TrackingStatus {
  const s = (status || '').toLowerCase();
  if (s.includes('delivered')) return 'delivered';
  if (s.includes('shipped')) return 'shipped';
  if (s.includes('transit')) return 'in_transit';
  if (s.includes('printed') || s.includes('production') || s.includes('printing')) return 'processing';
  if (s.includes('cancel') || s.includes('failed')) return 'failed';
  return 'pending';
}

// ============================================================
/**
 * Gelato n'utilise aucune credential par appel : la clé plateforme
 * (NEXIORA_GELATO_KEY) est lue directement dans glFetch(). Objet vide
 * conservé pour la cohérence de forme avec les autres fournisseurs dans
 * le registre central — voir supplier-adapter.ts sur merchantCredentials.
 */
export const gelatoCredentials: Record<string, string> = {};

export const gelatoAdapter: SupplierAdapter = {
  supplierId: 'gelato',
  displayName: 'Gelato',
  warehouseCountries: ['US', 'CA', 'DE', 'GB', 'AU', 'JP', 'BR', 'NL', 'SE'],
  avgShippingDays: { min: 3, max: 8 },

  // ---- SYNC (cle plateforme Nexiora) ----
  // apparel seul a ~465k variantes : on ne peut PAS tout aspirer. On cible les
  // catalogues pertinents pour les niches en rotation, borne le nombre de
  // produits par catalogue, et recupere le prix produit par produit (/prices).
  async syncCatalog(options: SyncOptions): Promise<SyncResult> {
    if (!NEXIORA_GELATO_KEY) {
      return { products: [], total_available: 0, has_more: false };
    }
    const PRODUCTS_PER_CATALOG = 15;
    const PRICE_COUNTRY = 'CA';
    const RATE_MS = 250;

    const catalogs = resolveCatalogs(options.categories || []);
    const allProducts: CatalogProduct[] = [];

    for (const catalogUid of catalogs) {
      await delay(RATE_MS);
      try {
        const search = await glFetch(PRODUCT_BASE, `/v3/catalogs/${catalogUid}/products:search`, {
          method: 'POST',
          body: JSON.stringify({ limit: PRODUCTS_PER_CATALOG }),
        });
        const products: any[] = (search?.products || []).slice(0, PRODUCTS_PER_CATALOG);

        for (const prod of products) {
          if (!prod?.productUid) continue;
          await delay(RATE_MS);
          try {
            const prices = await glFetch(
              PRODUCT_BASE,
              `/v3/products/${encodeURIComponent(prod.productUid)}/prices`,
            );
            const row = Array.isArray(prices)
              ? (prices.find((p: any) => p.country === PRICE_COUNTRY && p.quantity === 1) || prices[0])
              : null;
            const price = row?.price ? Number(row.price) : 0;
            const currency = row?.currency || 'USD';
            if (!price || price <= 0) continue;
            allProducts.push(mapGelatoProduct(prod, catalogUid, price, currency));
          } catch (e) {
            console.error(`[Gelato] prix ${prod.productUid}:`, (e as Error).message);
          }
        }
      } catch (e) {
        console.error(`[Gelato] catalogue ${catalogUid}:`, (e as Error).message);
      }
    }

    const seen = new Set<string>();
    const unique = allProducts.filter(p => {
      if (seen.has(p.supplier_product_id)) return false;
      seen.add(p.supplier_product_id);
      return true;
    });

    return { products: unique, total_available: unique.length, has_more: false, next_page: undefined };
  },

  // ---- STOCK / disponibilite ----
  // POD : pas de stock fini. Dispo = produit productible pour le pays + prix connu.
  async checkStock(request: StockCheckRequest): Promise<StockCheckResult> {
    const uid = request.supplier_product_id;
    const country = request.destination_country;
    try {
      const [product, prices] = await Promise.all([
        glFetch(PRODUCT_BASE, `/v3/products/${encodeURIComponent(uid)}`),
        glFetch(PRODUCT_BASE, `/v3/products/${encodeURIComponent(uid)}/prices`),
      ]);
      const notSupported: string[] = product?.notSupportedCountries || [];
      const available = !notSupported.includes(country);
      const row = Array.isArray(prices)
        ? (prices.find((p: any) => p.country === country && p.quantity === (request.quantity || 1))
           || prices.find((p: any) => p.country === country)
           || prices[0])
        : null;
      const price = row?.price ? Number(row.price) : 0;
      return {
        available: available && price > 0,
        current_price: price,
        stock_quantity: available ? 9999 : 0,
        shipping_cost: 0,
        shipping_days_min: 3,
        shipping_days_max: 8,
      };
    } catch (e) {
      return {
        available: false, current_price: 0, stock_quantity: 0,
        shipping_cost: 0, shipping_days_min: 0, shipping_days_max: 0,
      };
    }
  },

  // ---- SHIPPING (quote v3) ----
  // Le quote renvoie les methodes d'expedition REELLES (prix, delais). Garde-fou
  // anti-perte : vrai cout connu avant de commander.
  async calculateShipping(items: ShippingRequest[], countryCode: string): Promise<ShippingResult> {
    const NEUTRAL_FILE = 'https://raw.githubusercontent.com/github/explore/main/topics/react/react.png';
    const body = {
      orderReferenceId: `quote-${Date.now()}`,
      customerReferenceId: 'nexiora-quote',
      currency: 'USD',
      products: items.map((it, i) => ({
        itemReferenceId: `i${i}`,
        productUid: it.supplier_product_id,
        quantity: it.quantity,
        fileUrl: NEUTRAL_FILE,
      })),
      shipmentMethodUid: 'normal',
      shippingAddress: {
        firstName: 'Quote', lastName: 'Request', addressLine1: '1 Main St',
        city: 'City', postCode: '00000', country: countryCode, email: 'quote@woorri.com',
      },
    };
    const res = await glFetch(ORDER_BASE, '/v3/orders:quote', {
      method: 'POST', body: JSON.stringify(body),
    });
    const quote = (res?.quotes || [])[0];
    const method = (quote?.shipmentMethods || [])
      .slice()
      .sort((a: any, b: any) => (a.minDeliveryDays || 99) - (b.minDeliveryDays || 99))[0];
    const productTotal = (quote?.products || [])
      .reduce((s: number, p: any) => s + (Number(p.price) || 0), 0);
    const shipCost = method?.price ? Number(method.price) : 0;
    return {
      total_cost: productTotal + shipCost,
      currency: (quote?.products?.[0]?.currency) || 'USD',
      estimated_days_min: method?.minDeliveryDays ?? 3,
      estimated_days_max: method?.maxDeliveryDays ?? 8,
    };
  },

  // ---- CREATE ORDER (quote v3 -> create v2) ----
  // 1. quote v3 : valide prix + shipping, renvoie un deliveryPromiseId.
  // 2. create v2 : lance production/expedition contre le promise.
  async createOrder(order: OrderRequest): Promise<OrderResult> {
    const addr = order.shipping_address;
    const fileUrl = order.design_url || order.design_files?.[0]?.url || '';
    if (!fileUrl) {
      return {
        success: false, supplier_order_id: '',
        estimated_shipping_days: 0,
        error_message: 'Aucun design (fileUrl) fourni pour Gelato',
      };
    }

    // Nom : Gelato attend firstName/lastName ; on scinde full_name.
    const nameParts = (addr.full_name || '').trim().split(/\s+/);
    const firstName = nameParts.slice(0, -1).join(' ') || nameParts[0] || 'Client';
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '.';

    const quoteBody = {
      orderReferenceId: order.merchant_order_id,
      customerReferenceId: 'nexiora',
      currency: 'USD',
      products: [{
        itemReferenceId: order.merchant_order_id + '-1',
        productUid: order.supplier_product_id,
        quantity: order.quantity,
        fileUrl,
      }],
      shipmentMethodUid: 'normal',
      shippingAddress: {
        firstName, lastName,
        addressLine1: addr.address_line1,
        addressLine2: addr.address_line2 || undefined,
        city: addr.city,
        state: addr.province_state || undefined,
        postCode: addr.postal_code,
        country: addr.country,
        email: 'orders@woorri.com',
        phone: addr.phone || undefined,
      },
    };

    try {
      const quoteRes = await glFetch(ORDER_BASE, '/v3/orders:quote', {
        method: 'POST', body: JSON.stringify(quoteBody),
      });
      const quote = (quoteRes?.quotes || [])[0];
      const method = (quote?.shipmentMethods || [])
        .slice()
        .sort((a: any, b: any) => (a.minDeliveryDays || 99) - (b.minDeliveryDays || 99))[0];
      const promiseId = method?.deliveryPromiseId;
      if (!promiseId) {
        return {
          success: false, supplier_order_id: '',
          estimated_shipping_days: 0,
          error_message: 'Gelato: aucun deliveryPromiseId au quote',
        };
      }

      const createBody = {
        orderReferenceId: order.merchant_order_id,
        customerReferenceId: 'nexiora',
        currency: 'USD',
        deliveryPromiseId: promiseId,
      };
      const created = await glFetch(ORDER_BASE, '/v2/orders', {
        method: 'POST', body: JSON.stringify(createBody),
      });
      const supplierOrderId = created?.id || created?.orderId || order.merchant_order_id;
      return {
        success: true,
        supplier_order_id: String(supplierOrderId),
        estimated_shipping_days: method?.maxDeliveryDays ?? 8,
      };
    } catch (e) {
      return {
        success: false, supplier_order_id: '',
        estimated_shipping_days: 0,
        error_message: (e as Error).message,
      };
    }
  },

  // ---- TRACKING (status v2) ----
  async getTracking(supplierOrderId: string): Promise<TrackingResult> {
    try {
      const status = await glFetch(STATUS_BASE, `/v2/order/status/${encodeURIComponent(supplierOrderId)}`);
      const raw = status?.fulfillmentStatus || status?.status || '';
      const shipment = status?.shipment || status?.shipments?.[0] || {};
      return {
        supplier_order_id: supplierOrderId,
        status: mapGelatoStatus(raw),
        tracking_number: shipment?.trackingCode || undefined,
        carrier: shipment?.carrier || undefined,
        tracking_url: shipment?.trackingUrl || undefined,
        events: [],
      };
    } catch (e) {
      return {
        supplier_order_id: supplierOrderId,
        status: 'pending',
        events: [],
      };
    }
  },
};
