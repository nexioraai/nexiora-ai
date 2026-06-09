
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="menu_items"
fields={[
'item_id',
'name',
'description',
'category',
'subcategory',
'base_price',
'cost_price',
'profit_margin',
'preparation_time_minutes',
'calories',
'allergens',
'dietary_tags',
'is_available',
'is_seasonal',
'image_url',
'recipe_id'
]}
/>
)
}
