
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="deliveries"
fields={[
'delivery_id',
'order_id',
'customer_id',
'delivery_date',
'delivery_address',
'transporter',
'tracking_number',
'status',
'signed_by',
'notes'
]}
/>
)
}
