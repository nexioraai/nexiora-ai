import { NextRequest, NextResponse } from 'next/server';
import { cjAdapter } from '@/lib/suppliers/cj-adapter';
import { printfulAdapter } from '@/lib/suppliers/printful-adapter';
import { printifyAdapter } from '@/lib/suppliers/printify-adapter';
import { zendropAdapter } from '@/lib/suppliers/zendrop-adapter';
import type { SupplierAdapter } from '@/lib/suppliers/supplier-adapter';

const ADAPTERS: Record<string, SupplierAdapter> = {
  cj: cjAdapter,
  printful: printfulAdapter,
  printify: printifyAdapter,
  zendrop: zendropAdapter,
};

const CREDS: Record<string, Record<string, string>> = {
  cj: { email: process.env.CJ_EMAIL || '', apiKey: process.env.CJ_API_KEY || '' },
  printful: { printful_token: process.env.PRINTFUL_API_TOKEN || '' },
  printify: { printify_token: process.env.PRINTIFY_API_TOKEN || '', printify_shop_id: process.env.PRINTIFY_SHOP_ID || '' },
  zendrop: {},
};

export async function GET(req: NextRequest) {
  const supplierId = req.nextUrl.searchParams.get('supplier_id') || '';
  const supplierProductId = req.nextUrl.searchParams.get('supplier_product_id') || '';

  if (!supplierId || !supplierProductId) {
    return NextResponse.json({ variants: [] });
  }

  const adapter = ADAPTERS[supplierId];
  const creds = CREDS[supplierId];
  if (!adapter || !creds || !adapter.listVariants) {
    return NextResponse.json({ variants: [] });
  }

  try {
    const variants = await adapter.listVariants(supplierProductId, creds);
    const inStock = variants.filter((v) => v.stock_quantity > 0);
    return NextResponse.json({ variants: inStock });
  } catch (e) {
    console.error('[/api/catalog/variants]', supplierId, e);
    return NextResponse.json({ variants: [] });
  }
}
