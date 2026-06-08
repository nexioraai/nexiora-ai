
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="import_logistics"
fields={[
'shipment_id',
'po_number',
'supplier_id',
'shipping_method',
'carrier_name',
'bill_of_lading',
'container_number',
'departure_port',
'arrival_port',
'departure_date',
'estimated_arrival_date',
'actual_arrival_date',
'customs_declaration_number',
'customs_broker',
'customs_clearance_date',
'duties_paid',
'freight_cost',
'insurance_cost',
'shipment_status',
'documents_checklist'
]}
/>
)
}
