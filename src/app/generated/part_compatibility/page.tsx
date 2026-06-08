
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="part_compatibility"
fields={[
'compatibility_id',
'part_id',
'model_id',
'notes'
]}
/>
)
}
