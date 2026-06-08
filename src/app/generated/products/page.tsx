'use client'

import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="products"
fields={[
'part_number',
'caterpillar_oem_reference',
'part_name',
'description',
'category',
'compatible_models',
'unit_of_measure',
'purchase_price',
'selling_price',
'weight_kg',
'dimensions',
'country_of_origin',
'hs_code',
'minimum_stock',
'reorder_point',
'shelf_location'
]}
/>
)
}
