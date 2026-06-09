
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="promotions"
fields={[
'promotion_id',
'name',
'description',
'type',
'discount_value',
'discount_type',
'start_date',
'end_date',
'applicable_days',
'applicable_times',
'minimum_order_value',
'usage_limit',
'times_used',
'promo_code',
'is_active',
'created_by'
]}
/>
)
}
