import { RelationGraphItem } from './buildRelationGraph'
import { buildInverseRelationAttributes } from './buildInverseRelationAttributes'

export function buildInverseRelationField(
relation: RelationGraphItem
): string {

const attrs =
buildInverseRelationAttributes(
relation
)

return `${relation.inverseField} ${relation.sourceModel}[] ${attrs}`
}
