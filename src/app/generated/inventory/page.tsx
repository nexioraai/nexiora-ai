
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="inventory"
fields={[
'inventory_id',
'part_number',
'warehouse_location',
'quantity_on_hand',
'quantity_reserved',
'quantity_available',
'quantity_in_transit',
'last_received_date',
'last_sold_date',
'batch_number',
'expiry_date',
'condition',
'valuation_method'
]}
/>
)
}
