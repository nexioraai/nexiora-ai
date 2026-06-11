import { RelationGraphItem } from './buildRelationGraph'

export function buildPrismaRelations(
modelName: string,
graph: RelationGraphItem[]
): string {

const lines: string[] = []

for (const relation of graph) {

if (
relation.sourceModel !== modelName
) {
continue
}

if (
relation.relationType === 'many_to_one'
) {

lines.push(
`${relation.targetModel.slice(0, -1)} ${relation.targetModel}?`
)

continue
}

if (
relation.relationType === 'one_to_one'
) {

lines.push(
`${relation.targetModel.slice(0, -1)} ${relation.targetModel}?`
)

continue
}

if (
relation.relationType === 'one_to_many'
) {

lines.push(
`${relation.targetModel} ${relation.targetModel}[]`
)

continue
}

if (
relation.relationType === 'many_to_many'
) {

lines.push(
`${relation.targetModel} ${relation.targetModel}[]`
)

continue
}

}

return lines.join('\n')
}
