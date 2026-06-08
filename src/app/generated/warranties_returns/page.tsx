
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="warranties_returns"
fields={[
'rma_number',
'customer_id',
'order_number',
'part_number',
'return_date',
'reason',
'condition',
'quantity_returned',
'refund_amount',
'replacement_issued',
'status',
'notes'
]}
/>
)
}
