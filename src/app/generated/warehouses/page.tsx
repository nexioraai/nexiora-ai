
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="warehouses"
fields={[
'warehouse_id',
'warehouse_name',
'location',
'city',
'manager',
'phone',
'capacity',
'current_occupancy',
'type'
]}
/>
)
}
