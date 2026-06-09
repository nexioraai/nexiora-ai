
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="purchase_order_lines"
fields={[
'line_id',
'po_id',
'ingredient_id',
'ordered_quantity',
'received_quantity',
'unit_cost',
'line_total',
'unit_of_measure',
'expiry_date',
'batch_number',
'discrepancy_flag',
'discrepancy_reason'
]}
/>
)
}
