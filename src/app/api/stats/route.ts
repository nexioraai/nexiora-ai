import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
const [customers, suppliers, products, invoices] = await Promise.all([
supabaseAdmin.from('customers').select('*', { count: 'exact', head: true }),
supabaseAdmin.from('suppliers').select('*', { count: 'exact', head: true }),
supabaseAdmin.from('products').select('*', { count: 'exact', head: true }),
supabaseAdmin.from('invoices').select('*', { count: 'exact', head: true }),
])

return NextResponse.json({
customers: customers.count || 0,
suppliers: suppliers.count || 0,
products: products.count || 0,
invoices: invoices.count || 0,
})
}
