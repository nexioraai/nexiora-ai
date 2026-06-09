
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="kitchen_order_items"
fields={[
'line_id',
'order_id',
'menu_item_id',
'quantity',
'unit_price',
'line_total',
'modifications',
'allergen_alerts',
'status',
'sent_to_kitchen_at',
'started_cooking_at',
'ready_at',
'served_at',
'station',
'cook_id',
'special_instructions',
'void_reason'
]}
/>
)
}
