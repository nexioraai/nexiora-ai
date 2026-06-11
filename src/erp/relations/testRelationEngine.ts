import { buildRelationGraph } from './buildRelationGraph'
import { validateRelationGraph } from './validateRelationGraph'
import { resolveForeignKeys } from './resolveForeignKeys'

const relations = [
{
sourceModel: 'deliveries',
sourceField: 'customer_id',
targetModel: 'customers',
targetField: 'customer_id',
type: 'many_to_one'
}
]

const graph = buildRelationGraph(relations)

console.log('GRAPH')
console.log(graph)

console.log('VALIDATION')
console.log(validateRelationGraph(graph))

console.log('FK')
console.log(resolveForeignKeys(graph))
