
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="reservations"
fields={[
'reservation_id',
'guest_name',
'guest_phone',
'guest_email',
'party_size',
'table_id',
'reservation_date',
'reservation_time',
'duration_minutes',
'status',
'special_requests',
'occasion',
'dietary_requirements',
'deposit_paid',
'deposit_amount',
'source',
'confirmation_code',
'no_show_flag',
'created_at'
]}
/>
)
}
