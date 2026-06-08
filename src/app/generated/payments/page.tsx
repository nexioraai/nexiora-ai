
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="payments"
fields={[
'payment_id',
'payment_type',
'reference_number',
'customer_or_supplier_id',
'payment_date',
'amount',
'currency',
'exchange_rate',
'payment_method',
'bank_account',
'transaction_reference',
'notes',
'status'
]}
/>
)
}
