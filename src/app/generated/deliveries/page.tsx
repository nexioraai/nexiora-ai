
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="deliveries"
fields={[
'delivery_id',
'delivery_reference',
'customer_id',
'driver_id',
'vehicle_id',
'route_id',
'delivery_type',
'status',
'priority',
'pickup_address',
'pickup_city',
'pickup_postal_code',
'pickup_contact_name',
'pickup_contact_phone',
'pickup_scheduled_date',
'pickup_scheduled_time_from',
'pickup_scheduled_time_to',
'pickup_actual_datetime',
'delivery_address',
'delivery_city',
'delivery_postal_code',
'delivery_contact_name',
'delivery_contact_phone',
'delivery_scheduled_date',
'delivery_scheduled_time_from',
'delivery_scheduled_time_to',
'delivery_actual_datetime',
'distance_km',
'weight_kg',
'volume_m3',
'package_count',
'fragile',
'requires_cold_chain',
'requires_signature',
'special_instructions',
'delivery_cost',
'billing_status',
'proof_of_delivery_photo',
'signature_image',
'recipient_name',
'gps_track_start',
'gps_track_end',
'failure_reason',
'attempt_count',
'notes'
]}
/>
)
}
