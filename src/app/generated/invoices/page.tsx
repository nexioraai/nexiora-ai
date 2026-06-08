
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="invoices"
fields={[
'invoice_number',
'invoice_type',
'order_number',
'customer_id',
'invoice_date',
'due_date',
'part_number',
'quantity',
'unit_price',
'subtotal',
'tax_amount',
'discount',
'total_amount',
'currency',
'payment_status',
'payment_date',
'payment_method'
]}
/>
)
}
