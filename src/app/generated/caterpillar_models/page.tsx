
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="caterpillar_models"
fields={[
'model_id',
'model_name',
'model_category',
'serial_number_range',
'year_range',
'engine_type',
'compatible_parts',
'description'
]}
/>
)
}
