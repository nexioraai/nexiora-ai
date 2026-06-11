
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="vehicles"
fields={[
'vehicle_id',
'registration_number',
'brand',
'model',
'year',
'vehicle_type',
'fuel_type',
'payload_capacity_kg',
'volume_capacity_m3',
'current_mileage_km',
'last_service_date',
'next_service_date',
'insurance_number',
'insurance_expiry_date',
'technical_inspection_date',
'technical_inspection_expiry',
'gps_tracker_id',
'status',
'current_location',
'acquisition_date',
'acquisition_cost',
'assigned_driver_id',
'notes'
]}
/>
)
}
