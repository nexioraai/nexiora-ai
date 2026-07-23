import 'server-only';

// ============================================================
// Nexiora — Supplier Adapter Interface
// Contrat universel pour chaque fournisseur.
// ============================================================

export interface CatalogProduct {
  supplier_id: string;
  supplier_product_id: string;
  supplier_parent_id?: string;
  name: string;
  description: string;
  category: string;
  images: string[];
  price: number;
  currency: string;
  variants: ProductVariant[];
  shipping_days_min: number;
  shipping_days_max: number;
  warehouse_country: string;
  in_stock: boolean;
  last_synced_at: string;
}

export interface ProductVariant {
  variant_id: string;
  name: string;
  sku: string;
  price: number;
  stock_quantity: number;
  image?: string;
}

export interface StockCheckRequest {
  supplier_product_id: string;
  variant_id: string;
  quantity: number;
  destination_country: string;
}

export interface StockCheckResult {
  available: boolean;
  current_price: number;
  stock_quantity: number;
  shipping_cost: number;
  shipping_days_min: number;
  shipping_days_max: number;
}

export interface OrderRequest {
  supplier_product_id: string;
  variant_id: string;
  quantity: number;
  shipping_address: ShippingAddress;
  merchant_order_id: string;
  design_url?: string;
  design_position?: Record<string, number>;
  design_placement?: string;
}

export interface ShippingAddress {
  full_name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  province_state: string;
  postal_code: string;
  country: string;
  phone: string;
}

export interface OrderResult {
  success: boolean;
  supplier_order_id: string;
  estimated_shipping_days: number;
  error_message?: string;
}

export interface TrackingResult {
  supplier_order_id: string;
  status: TrackingStatus;
  tracking_number?: string;
  carrier?: string;
  tracking_url?: string;
  events: TrackingEvent[];
}

export type TrackingStatus =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'in_transit'
  | 'delivered'
  | 'failed';

export interface TrackingEvent {
  timestamp: string;
  status: TrackingStatus;
  description: string;
  location?: string;
}

export interface SyncOptions {
  categories: string[];
  page?: number;
  page_size?: number;
}

export interface SyncResult {
  products: CatalogProduct[];
  total_available: number;
  has_more: boolean;
  next_page?: number;
}

export interface ShippingRequest {
  supplier_product_id: string;
  variant_id?: string;
  quantity: number;
}

export interface ShippingResult {
  total_cost: number;
  currency: string;
  estimated_days_min: number;
  estimated_days_max: number;
}

export interface SupplierAdapter {
  readonly supplierId: string;
  readonly displayName: string;
  readonly warehouseCountries: string[];
  readonly avgShippingDays: { min: number; max: number };

  syncCatalog(options: SyncOptions): Promise<SyncResult>;

  checkStock(
    request: StockCheckRequest,
    merchantCredentials: Record<string, string>
  ): Promise<StockCheckResult>;

  createOrder(
    order: OrderRequest,
    merchantCredentials: Record<string, string>
  ): Promise<OrderResult>;

  getTracking(
    supplierOrderId: string,
    merchantCredentials: Record<string, string>
  ): Promise<TrackingResult>;

  calculateShipping?(
    items: ShippingRequest[],
    countryCode: string,
    merchantCredentials: Record<string, string>
  ): Promise<ShippingResult>;
  listVariants?(
    supplierProductId: string,
    credentials: Record<string, string>
  ): Promise<ProductVariant[]>;
}
