
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="import_operations"
fields={[
'import_id',
'po_id',
'shipment_number',
'origin_country',
'destination_country',
'shipping_mode',
'carrier_name',
'bill_of_lading',
'container_number',
'departure_date',
'arrival_date',
'customs_declaration_number',
'customs_clearance_date',
'customs_broker',
'duties_amount',
'taxes_amount',
'freight_amount',
'insurance_amount',
'total_landed_cost',
'status',
'documents'
]}
/>
)
}
