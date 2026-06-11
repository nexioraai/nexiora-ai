
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
'pickup_address',
'pickup_city',
'pickup_postal_code',
'pickup_country',
'pickup_contact_name',
'pickup_contact_phone',
'scheduled_pickup_date',
'actual_pickup_date',
'delivery_address',
'delivery_city',
'delivery_postal_code',
'delivery_country',
'delivery_contact_name',
'delivery_contact_phone',
'scheduled_delivery_date',
'actual_delivery_date',
'cargo_description',
'cargo_weight_kg',
'cargo_volume_m3',
'cargo_quantity',
'cargo_type',
'is_fragile',
'requires_refrigeration',
'temperature_min',
'temperature_max',
'distance_km',
'estimated_duration_hours',
'actual_duration_hours',
'delivery_status',
'priority_level',
'tracking_code',
'proof_of_delivery_signature',
'proof_of_delivery_photo',
'delivery_notes',
'failure_reason',
'delivery_cost',
'billing_status',
'created_at',
'updated_at'
]}
/>
)
}
