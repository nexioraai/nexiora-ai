import { buildRelationGraph } from './buildRelationGraph'
import { buildPrismaRelations } from './buildPrismaRelations'

const relations = [
{
relationName: 'DeliveryCustomer',
sourceModel: 'deliveries',
sourceField: 'customer_id',
targetModel: 'customers',
targetField: 'customer_id',
inverseField: 'deliveries',
type: 'many_to_one'
}
]

const graph =
buildRelationGraph(relations)

console.log(
buildPrismaRelations(
'deliveries',
graph
)
)
