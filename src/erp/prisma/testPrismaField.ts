import { buildPrismaField } from './buildPrismaField'

console.log(
buildPrismaField({
name: 'customer_id',
type: 'id'
})
)

console.log(
buildPrismaField({
name: 'email',
type: 'string',
unique: true
})
)

console.log(
buildPrismaField({
name: 'total',
type: 'float',
required: true
})
)
