
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
'emergency_phone',
'email',
'address',
'city',
'hire_date',
'employment_type',
'license_number',
'license_category',
'license_issue_date',
'license_expiry_date',
'medical_certificate_expiry',
'adr_certificate',
'adr_expiry_date',
'status',
'assigned_vehicle_id',
'total_deliveries',
'total_km_driven',
'rating_average',
'salary_base',
'bonus_per_delivery',
'bank_account',
'notes'
]}
/>
)
}
