
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="dining_orders"
fields={[
'order_id',
'table_id',
'reservation_id',
'order_type',
'status',
'opened_at',
'closed_at',
'waiter_id',
'guest_count',
'subtotal',
'tax_amount',
'tip_amount',
'discount_amount',
'total_amount',
'payment_status',
'payment_method',
'split_bill_flag',
'notes',
'kitchen_priority'
]}
/>
)
}
