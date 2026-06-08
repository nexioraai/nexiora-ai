
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="warehouses"
fields={[
'warehouse_id',
'warehouse_name',
'address',
'city',
'country',
'manager_name',
'phone',
'email',
'capacity',
'type'
]}
/>
)
}
