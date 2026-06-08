
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="stock_movements"
fields={[
'movement_id',
'movement_type',
'part_id',
'warehouse_id',
'quantity',
'reference_document',
'movement_date',
'performed_by',
'notes'
]}
/>
)
}
