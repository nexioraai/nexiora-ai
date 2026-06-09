
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="employees"
fields={[
'employee_id',
'full_name',
'role',
'department',
'phone',
'email',
'hire_date',
'employment_type',
'hourly_rate',
'salary',
'shift_type',
'certifications',
'food_safety_certificate_expiry',
'performance_rating',
'is_active',
'emergency_contact',
'bank_details'
]}
/>
)
}
