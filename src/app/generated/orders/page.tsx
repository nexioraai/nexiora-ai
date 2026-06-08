
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="orders"
fields={[
'order_id',
'customer_id',
'order_date',
'status',
'total_amount',
'payment_status',
'delivery_date'
]}
/>
)
}
