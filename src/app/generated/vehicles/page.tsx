
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="vehicles"
fields={[
'vehicle_id',
'license_plate',
'brand',
'model',
'year',
'vehicle_type',
'fuel_type',
'mileage_current',
'mileage_last_service',
'payload_capacity_kg',
'volume_capacity_m3',
'registration_number',
'registration_expiry_date',
'insurance_provider',
'insurance_policy_number',
'insurance_expiry_date',
'technical_inspection_date',
'technical_inspection_expiry',
'status',
'acquisition_date',
'acquisition_cost',
'gps_device_id',
'current_location',
'assigned_depot',
'notes'
]}
/>
)
}
