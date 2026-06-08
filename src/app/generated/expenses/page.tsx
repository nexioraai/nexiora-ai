
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="expenses"
fields={[
'expense_id',
'expense_date',
'category',
'description',
'amount',
'currency',
'supplier_id',
'invoice_reference',
'payment_method',
'approved_by',
'status'
]}
/>
)
}
