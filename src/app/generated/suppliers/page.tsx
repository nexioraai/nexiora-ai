
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="suppliers"
fields={[
'supplier_id',
'company_name',
'contact_name',
'phone',
'email',
'country',
'address',
'tax_number',
'supplier_type',
'currency',
'payment_terms',
'lead_time_days',
'incoterms',
'bank_details'
]}
/>
)
}
