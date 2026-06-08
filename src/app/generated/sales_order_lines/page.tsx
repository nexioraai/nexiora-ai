
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="sales_order_lines"
fields={[
'line_id',
'order_id',
'part_number',
'cat_part_number',
'quantity',
'unit_price_xaf',
'discount_percent',
'total_price_xaf',
'margin_percent'
]}
/>
)
}
