
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="sales_orders"
fields={[
'order_id',
'customer_id',
'order_date',
'delivery_date',
'salesperson',
'currency',
'exchange_rate',
'subtotal_xaf',
'discount_percent',
'tax_amount',
'total_amount_xaf',
'total_amount_usd',
'payment_terms',
'delivery_address',
'status',
'invoice_id',
'notes'
]}
/>
)
}
