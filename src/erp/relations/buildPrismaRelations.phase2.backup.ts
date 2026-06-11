import { buildInverseRelationAttributes } from "./buildInverseRelationAttributes"
import { buildRelationAttributes } from './buildRelationAttributes'
import { RelationGraphItem } from './buildRelationGraph'

export function buildPrismaRelations(
modelName: string,
graph: RelationGraphItem[]
): string {

const lines: string[] = []

for (const relation of graph) {

//
// MANY TO ONE
//

if (
relation.relationType === 'many_to_one'
) {

if (
relation.sourceModel === modelName
) {

const attrs =
buildRelationAttributes(relation)

lines.push(
`${relation.targetModel.slice(0, -1)} ${relation.targetModel}? ${attrs}`
)

}

if (
relation.targetModel === modelName
) {

lines.push(
`${relation.inverseField} ${relation.sourceModel}[]`
)

}

continue
}

//
// ONE TO MANY
//

if (
relation.relationType === 'one_to_many'
) {

if (
relation.sourceModel === modelName
) {

lines.push(
`${relation.targetModel} ${relation.targetModel}[]`
)

}

if (
relation.targetModel === modelName
) {

const inverseAttrs =
buildInverseRelationAttributes(relation)

lines.push(
`${relation.inverseField} ${relation.sourceModel}? ${inverseAttrs}`
)

}

continue
}

//
// ONE TO ONE
//

if (
relation.relationType === 'one_to_one'
) {

if (
relation.sourceModel === modelName
) {

const attrs =
buildRelationAttributes(relation)

lines.push(
`${relation.targetModel.slice(0, -1)} ${relation.targetModel}? ${attrs}`
)

}

if (
relation.targetModel === modelName
) {

const inverseAttrs =
buildInverseRelationAttributes(relation)

lines.push(
`${relation.inverseField} ${relation.sourceModel}? ${inverseAttrs}`
)

}

continue
}

//
// MANY TO MANY
//

if (
relation.relationType === 'many_to_many'
) {

if (
relation.sourceModel === modelName
) {

lines.push(
`${relation.targetModel} ${relation.targetModel}[]`
)

}

if (
relation.targetModel === modelName
) {

lines.push(
`${relation.inverseField} ${relation.sourceModel}[]`
)

}

continue
}

}

return lines.join('\n')
}
