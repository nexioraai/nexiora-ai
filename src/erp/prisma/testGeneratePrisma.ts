import { generatePrismaSchema } from './generatePrisma'

const erp = {
models: [
{
name: 'customers',

fields: [
{
name: 'customer_id',
type: 'id'
},
{
name: 'email',
type: 'string',
unique: true
},
{
name: 'balance',
type: 'float'
}
]
}
]
}

console.log(
generatePrismaSchema(
erp
)
)
