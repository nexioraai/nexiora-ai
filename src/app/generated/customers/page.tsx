
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="customers"
fields={[
'name',
'phone',
'email',
'address',
'customer_type',
'created_at'
]}
/>
)
}
