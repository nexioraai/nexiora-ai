import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {

const customers = await supabaseAdmin
.from('customers')
.select('*', { count: 'exact', head: true })

const suppliers = await supabaseAdmin
.from('suppliers')
.select('*', { count: 'exact', head: true })

const products = await supabaseAdmin
.from('products')
.select('*', { count: 'exact', head: true })

const invoices = await supabaseAdmin
.from('invoices')
.select('*', { count: 'exact', head: true })

return NextResponse.json({
customers: customers.count || 0,
suppliers: suppliers.count || 0,
products: products.count || 0,
invoices: invoices.count || 0
})
}
