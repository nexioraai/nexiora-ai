import { RelationGraphItem } from './buildRelationGraph'

export function buildRelationAttributes(
relation: RelationGraphItem
): string {

if (
relation.relationType === 'many_to_one'
) {

return `@relation(
fields: [${relation.sourceField}],
references: [${relation.targetField}]
)`
}

if (
relation.relationType === 'one_to_one'
) {

return `@relation(
fields: [${relation.sourceField}],
references: [${relation.targetField}]
)`
}

return ''
}
