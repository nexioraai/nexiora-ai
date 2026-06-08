export const MODULE_FIELDS: Record<string, string[]> = {
patients: ['name', 'phone', 'birthDate', 'address'],
doctors: ['name', 'speciality', 'phone', 'email'],
appointments: ['patient', 'doctor', 'date', 'status'],
billing: ['invoiceNumber', 'patient', 'amount', 'status'],

customers: ['name', 'phone', 'email', 'address'],
vehicles: ['plate', 'brand', 'model', 'owner'],
repairs: ['vehicle', 'problem', 'cost', 'status'],
invoices: ['number', 'customer', 'amount', 'status'],

students: ['name', 'class', 'parent', 'phone'],
teachers: ['name', 'subject', 'phone', 'email'],
classes: ['name', 'teacher', 'room'],
grades: ['student', 'subject', 'grade'],

products: ['name', 'price', 'stock'],
sales: ['product', 'quantity', 'amount'],

orders: ['customer', 'total', 'status'],
menu: ['name', 'price', 'category'],
inventory: ['product', 'quantity', 'alert'],

reports: ['title', 'value']
}
