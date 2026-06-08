
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="purchase_order_lines"
fields={[
'line_id',
'po_id',
'part_id',
'caterpillar_part_number',
'quantity_ordered',
'quantity_received',
'unit_price',
'currency',
'discount_percent',
'line_total',
'notes'
]}
/>
)
}
