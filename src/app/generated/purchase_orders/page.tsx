
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="purchase_orders"
fields={[
'po_number',
'supplier_id',
'order_date',
'expected_delivery_date',
'incoterms',
'currency',
'exchange_rate',
'part_number',
'quantity_ordered',
'unit_price',
'total_amount',
'shipping_cost',
'insurance_cost',
'customs_duties',
'taxes',
'total_landed_cost',
'status',
'payment_status',
'notes'
]}
/>
)
}
