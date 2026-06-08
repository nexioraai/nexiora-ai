
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="imports_customs"
fields={[
'import_id',
'po_number',
'bill_of_lading',
'invoice_number',
'packing_list_ref',
'country_of_origin',
'port_of_entry',
'arrival_date',
'customs_declaration_number',
'customs_broker',
'hs_code',
'declared_value_usd',
'customs_duty_rate',
'customs_duty_amount_xaf',
'vat_amount_xaf',
'other_taxes_xaf',
'total_customs_cost_xaf',
'clearance_date',
'status',
'documents_attached'
]}
/>
)
}
