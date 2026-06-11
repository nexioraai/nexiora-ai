import { RelationGraphItem } from './buildRelationGraph'
import { buildRelationAttributes } from './buildRelationAttributes'

export function buildRelationField(
relation: RelationGraphItem
): string {

const modelName =
relation.targetModel.slice(0, -1)

const attrs =
buildRelationAttributes(relation)

return `${modelName} ${relation.targetModel}? ${attrs}`
}
