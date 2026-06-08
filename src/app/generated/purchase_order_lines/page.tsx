
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="purchase_order_lines"
fields={[
'line_id',
'po_number',
'part_number',
'cat_part_number',
'quantity_ordered',
'unit_price_usd',
'total_price_usd',
'quantity_received',
'quantity_pending'
]}
/>
)
}
