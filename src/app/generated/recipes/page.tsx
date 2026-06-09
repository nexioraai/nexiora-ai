
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="recipes"
fields={[
'recipe_id',
'name',
'instructions',
'serving_size',
'prep_time_minutes',
'cook_time_minutes',
'difficulty_level',
'plating_notes',
'version',
'created_by_chef',
'last_updated'
]}
/>
)
}
