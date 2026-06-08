
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="exchange_rates"
fields={[
'rate_id',
'currency_from',
'currency_to',
'rate',
'date',
'source'
]}
/>
)
}
