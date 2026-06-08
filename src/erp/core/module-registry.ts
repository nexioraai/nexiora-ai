export const MODULES = {
hospital: {
name: 'Hospital ERP',
modules: [
'patients',
'appointments',
'doctors',
'billing',
'reports',
],
},

school: {
name: 'School ERP',
modules: [
'students',
'teachers',
'classes',
'grades',
'reports',
],
},

garage: {
name: 'Garage ERP',
modules: [
'customers',
'vehicles',
'repairs',
'invoices',
'reports',
],
},

retail: {
name: 'Retail ERP',
modules: [
'products',
'inventory',
'sales',
'customers',
'reports',
],
},

travel: {
name: 'Travel ERP',
modules: [
'customers',
'bookings',
'tickets',
'payments',
'reports',
],
},

restaurant: {
name: 'Restaurant ERP',
modules: [
'dashboard',
'orders',
'menu',
'inventory',
'reports',
],
},

} as const;