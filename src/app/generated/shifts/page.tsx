
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="shifts"
fields={[
'shift_id',
'employee_id',
'shift_date',
'scheduled_start',
'scheduled_end',
'actual_start',
'actual_end',
'break_duration_minutes',
'total_hours_worked',
'role_during_shift',
'station_assigned',
'tips_earned',
'notes',
'attendance_status'
]}
/>
)
}
