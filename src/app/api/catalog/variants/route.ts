import { NextRequest, NextResponse } from 'next/server';
import { suppliersWithCapability } from '@/lib/suppliers/registry';

// Derive : fournisseurs implementant reellement listVariants (Gelato en
// est absent legitimement — chaque CatalogProduct Gelato est deja la
// variante exacte, voir gelato-adapter.ts). Voir registry.ts.
const VARIANT_SUPPLIERS = new Map(
  suppliersWithCapability('listVariants').map((s) => [s.id, s])
);

export async function GET(req: NextRequest) {
  const supplierId = req.nextUrl.searchParams.get('supplier_id') || '';
  const supplierProductId = req.nextUrl.searchParams.get('supplier_product_id') || '';

  if (!supplierId || !supplierProductId) {
    return NextResponse.json({ variants: [] });
  }

  const supplier = VARIANT_SUPPLIERS.get(supplierId);
  if (!supplier || !supplier.adapter.listVariants) {
    return NextResponse.json({ variants: [] });
  }

  try {
    const variants = await supplier.adapter.listVariants(supplierProductId, supplier.credentials);
    const inStock = variants.filter((v) => v.stock_quantity > 0);
    return NextResponse.json({ variants: inStock });
  } catch (e) {
    console.error('[/api/catalog/variants]', supplierId, e);
    return NextResponse.json({ variants: [] });
  }
}
