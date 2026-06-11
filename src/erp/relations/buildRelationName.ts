import { RelationGraphItem } from './buildRelationGraph'

export function buildRelationName(
relation: RelationGraphItem
): string {

if (
relation.relationName
) {
return relation.relationName
}

return [
relation.sourceModel,
relation.targetModel
].join('_')
}
