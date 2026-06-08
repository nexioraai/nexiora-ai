
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="suppliers"
fields={[
'name',
'phone',
'email',
'address',
'tax_id',
'payment_terms'
]}
/>
)
}
