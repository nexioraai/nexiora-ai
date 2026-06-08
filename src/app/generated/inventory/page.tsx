
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="inventory"
fields={[
'product_id',
'warehouse_location',
'quantity_on_hand',
'quantity_reserved',
'last_updated'
]}
/>
)
}
