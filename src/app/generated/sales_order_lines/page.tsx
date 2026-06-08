
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="sales_order_lines"
fields={[
'line_id',
'order_id',
'part_id',
'caterpillar_part_number',
'quantity_ordered',
'quantity_delivered',
'unit_price',
'discount_percent',
'tax_rate',
'line_total',
'notes'
]}
/>
)
}
