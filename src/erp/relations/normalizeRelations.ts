import { RelationGraphItem } from './buildRelationGraph'

export function normalizeRelations(
graph: RelationGraphItem[]
): RelationGraphItem[] {

const seen =
new Set<string>()

const normalized:
RelationGraphItem[] = []

for (const relation of graph) {

const directKey =
[
relation.sourceModel,
relation.targetModel,
relation.sourceField,
relation.targetField
].join('|')

const reverseKey =
[
relation.targetModel,
relation.sourceModel,
relation.targetField,
relation.sourceField
].join('|')

if (
seen.has(directKey) ||
seen.has(reverseKey)
) {
continue
}

seen.add(directKey)

normalized.push(relation)
}

return normalized
}
