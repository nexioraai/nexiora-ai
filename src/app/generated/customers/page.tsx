
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
'phone',
'mobile',
'email',
'billing_address',
'billing_city',
'billing_postal_code',
'billing_country',
'default_delivery_address',
'default_delivery_city',
'default_delivery_postal_code',
'tax_number',
'registration_number',
'payment_terms_days',
'credit_limit',
'currency',
'customer_type',
'account_status',
'total_orders',
'total_revenue',
'assigned_account_manager',
'notes',
'created_at'
]}
/>
)
}
