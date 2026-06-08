
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="payments"
fields={[
'payment_id',
'invoice_id',
'customer_id',
'payment_date',
'amount_xaf',
'payment_method',
'bank_reference',
'mobile_money_reference',
'received_by',
'notes'
]}
/>
)
}
