
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="recipe_ingredients"
fields={[
'line_id',
'recipe_id',
'ingredient_id',
'quantity',
'unit_of_measure',
'preparation_note',
'is_optional',
'substitute_ingredient_id'
]}
/>
)
}
