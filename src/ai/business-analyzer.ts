export interface BusinessAnalysis {
activity: string
modules: string[]
}

export function analyzeActivity(
activity: string
): BusinessAnalysis {

switch (activity) {

case 'transport':
return {
activity,
modules: [
'vehicles',
'drivers',
'deliveries',
'customers'
]
}

case 'education':
return {
activity,
modules: [
'students',
'teachers',
'grades',
'payments'
]
}

case 'healthcare':
return {
activity,
modules: [
'patients',
'appointments',
'staff',
'billing'
]
}

case 'hospitality':
return {
activity,
modules: [
'orders',
'inventory',
'employees',
'deliveries'
]
}

default:
return {
activity,
modules: [
'customers',
'inventory',
'sales',
'employees'
]
}
}
}
