
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="machinery_equipment_catalog"
fields={[
'model_id',
'cat_model',
'machine_type',
'serial_number_range',
'compatible_parts',
'description',
'sector'
]}
/>
)
}
