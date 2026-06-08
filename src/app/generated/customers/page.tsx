
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="customers"
fields={[
'customer_id',
'company_name',
'contact_name',
'phone',
'email',
'address',
'city',
'country',
'tax_number',
'customer_type',
'credit_limit',
'payment_terms',
'currency'
]}
/>
)
}
