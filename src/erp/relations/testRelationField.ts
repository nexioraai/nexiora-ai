import { buildRelationGraph } from './buildRelationGraph'
import { buildRelationField } from './buildRelationField'

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
buildRelationField(
graph[0]
)
)
