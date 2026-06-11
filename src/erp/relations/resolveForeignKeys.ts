import { RelationGraphItem } from './buildRelationGraph'

export interface ForeignKeyResolution {
relationName: string
foreignKeyOwner: string
}

export function resolveForeignKeys(
graph: RelationGraphItem[]
): ForeignKeyResolution[] {

return graph.map((relation) => ({

relationName:
`${relation.sourceModel}_${relation.targetModel}`,

foreignKeyOwner:
relation.foreignKeyOwner

}))
}
