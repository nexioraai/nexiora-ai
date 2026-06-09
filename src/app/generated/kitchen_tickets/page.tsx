
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="kitchen_tickets"
fields={[
'ticket_id',
'order_id',
'station',
'ticket_number',
'printed_at',
'acknowledged_at',
'completed_at',
'priority_level',
'notes',
'bump_count',
'status'
]}
/>
)
}
