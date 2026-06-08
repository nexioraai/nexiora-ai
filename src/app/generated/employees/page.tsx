
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
'salary',
'permissions_level'
]}
/>
)
}
