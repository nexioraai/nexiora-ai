
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="products"
fields={[
'name',
'sku',
'price',
'cost',
'category',
'stock_quantity',
'reorder_level'
]}
/>
)
}
