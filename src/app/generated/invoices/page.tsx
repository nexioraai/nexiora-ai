
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="invoices"
fields={[
'invoice_id',
'order_id',
'issue_date',
'due_date',
'amount',
'tax',
'status'
]}
/>
)
}
