import { RelationGraphItem } from './buildRelationGraph'
import { buildRelationName } from './buildRelationName'

export function buildRelationAttributes(
relation: RelationGraphItem
): string {

const relationName =
buildRelationName(relation)

if (
relation.relationType === 'many_to_one'
) {

return `@relation(
"${relationName}",
fields: [${relation.sourceField}],
references: [${relation.targetField}]
)`
}

if (
relation.relationType === 'one_to_one'
) {

return `@relation(
"${relationName}",
fields: [${relation.sourceField}],
references: [${relation.targetField}]
)`
}

return ''
}
