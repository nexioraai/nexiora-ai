
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="drivers"
fields={[
'driver_id',
'first_name',
'last_name',
'date_of_birth',
'national_id',
'phone',
'email',
'address',
'city',
'license_number',
'license_category',
'license_issue_date',
'license_expiry_date',
'adr_certificate',
'adr_expiry_date',
'hire_date',
'employment_type',
'status',
'total_km_driven',
'total_deliveries_completed',
'rating_score',
'emergency_contact_name',
'emergency_contact_phone',
'notes'
]}
/>
)
}
