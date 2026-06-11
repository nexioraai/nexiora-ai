import { buildRelationGraph } from './buildRelationGraph'
import { buildPrismaRelations } from './buildPrismaRelations'

const graph = buildRelationGraph([
{
sourceModel: 'deliveries',
sourceField: 'customer_id',
targetModel: 'customers',
targetField: 'customer_id',
type: 'many_to_one'
}
])

console.log(
buildPrismaRelations(
'deliveries',
graph
)
)
