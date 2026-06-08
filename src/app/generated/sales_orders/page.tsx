
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="sales_orders"
fields={[
'order_number',
'customer_id',
'order_date',
'delivery_date',
'part_number',
'quantity',
'unit_price',
'discount',
'tax_rate',
'total_amount',
'currency',
'payment_terms',
'delivery_address',
'order_status',
'invoice_number',
'payment_status',
'notes'
]}
/>
)
}
