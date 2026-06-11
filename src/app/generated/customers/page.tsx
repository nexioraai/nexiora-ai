
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="customers"
fields={[
'customer_id',
'company_name',
'contact_first_name',
'contact_last_name',
'customer_type',
'phone',
'mobile',
'email',
'tax_id',
'billing_address',
'billing_city',
'billing_postal_code',
'billing_country',
'default_delivery_address',
'default_delivery_city',
'default_delivery_postal_code',
'default_delivery_country',
'delivery_instructions',
'preferred_delivery_time_slot',
'credit_limit',
'payment_terms_days',
'contract_start_date',
'contract_end_date',
'rate_per_km',
'rate_per_kg',
'flat_delivery_rate',
'status',
'account_manager',
'total_deliveries',
'total_revenue',
'notes'
]}
/>
)
}
