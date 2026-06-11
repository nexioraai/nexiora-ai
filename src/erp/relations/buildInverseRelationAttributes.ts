import { RelationGraphItem } from './buildRelationGraph'
import { buildRelationName } from './buildRelationName'

export function buildInverseRelationAttributes(
relation: RelationGraphItem
): string {

const relationName =
buildRelationName(relation)

if (
relation.relationType === 'many_to_one'
) {
return `@relation("${relationName}")`
}

if (
relation.relationType === 'one_to_one'
) {
return `@relation("${relationName}")`
}

return ''
}
