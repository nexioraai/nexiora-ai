
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="quotations"
fields={[
'quotation_id',
'quotation_number',
'customer_id',
'quotation_date',
'validity_date',
'currency',
'status',
'subtotal',
'tax_amount',
'discount_amount',
'total_amount',
'notes',
'sales_rep'
]}
/>
)
}
