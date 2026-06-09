
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="purchase_orders"
fields={[
'po_id',
'supplier_id',
'order_date',
'expected_delivery_date',
'actual_delivery_date',
'status',
'total_amount',
'payment_status',
'payment_due_date',
'ordered_by',
'received_by',
'delivery_notes',
'invoice_reference',
'discrepancy_notes'
]}
/>
)
}
