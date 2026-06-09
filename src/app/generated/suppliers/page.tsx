
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="suppliers"
fields={[
'supplier_id',
'company_name',
'contact_person',
'phone',
'email',
'address',
'city',
'country',
'payment_terms',
'delivery_schedule',
'minimum_order_value',
'lead_time_days',
'rating',
'is_active',
'tax_id',
'bank_details',
'notes'
]}
/>
)
}
