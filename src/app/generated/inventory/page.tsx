
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="inventory"
fields={[
'ingredient_id',
'name',
'category',
'unit_of_measure',
'current_stock',
'minimum_stock_level',
'reorder_point',
'reorder_quantity',
'unit_cost',
'storage_location',
'storage_conditions',
'supplier_id',
'expiry_date',
'last_received_date',
'last_counted_date',
'waste_percentage',
'is_perishable'
]}
/>
)
}
