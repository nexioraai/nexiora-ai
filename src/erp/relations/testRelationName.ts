import { buildRelationName } from './buildRelationName'

console.log(
buildRelationName({
relationName: 'DeliveryCustomer'
} as any)
)

console.log(
buildRelationName({
sourceModel: 'deliveries',
targetModel: 'customers'
} as any)
)
