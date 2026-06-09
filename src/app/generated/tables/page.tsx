
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="tables"
fields={[
'table_id',
'table_number',
'section',
'floor',
'capacity',
'shape',
'is_outdoor',
'is_accessible',
'status',
'current_reservation_id',
'assigned_waiter_id',
'qr_code'
]}
/>
)
}
