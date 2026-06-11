import { buildRelationGraph } from './buildRelationGraph'
import { normalizeRelations } from './normalizeRelations'

const relations = [

{
relationName: 'DeliveryCustomer',

sourceModel: 'deliveries',
sourceField: 'customer_id',

targetModel: 'customers',
targetField: 'customer_id',

inverseField: 'deliveries',

type: 'many_to_one'
},

{
relationName: 'CustomerDeliveries',

sourceModel: 'customers',
sourceField: 'customer_id',

targetModel: 'deliveries',
targetField: 'customer_id',

inverseField: 'customer',

type: 'one_to_many'
}

]

const graph =
buildRelationGraph(relations)

console.log('BEFORE')
console.log(graph.length)

const normalized =
normalizeRelations(graph)

console.log('AFTER')
console.log(normalized.length)

console.log(normalized)
