
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="purchases"
fields={[
'purchase_order_id',
'supplier_id',
'order_date',
'expected_delivery',
'status',
'total_cost'
]}
/>
)
}
