
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
'shipping_method',
'port_of_loading',
'port_of_destination',
'currency',
'exchange_rate',
'subtotal_usd',
'freight_cost',
'insurance_cost',
'customs_duties',
'total_landed_cost_xaf',
'status',
'payment_status',
'notes'
]}
/>
)
}
