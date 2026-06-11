export interface RelationGraphItem {
sourceModel: string
sourceField: string

targetModel: string
targetField: string

relationType:
| 'one_to_one'
| 'one_to_many'
| 'many_to_one'
| 'many_to_many'

foreignKeyOwner: string

isValid: boolean
}

export function buildRelationGraph(
relations: any[] = []
): RelationGraphItem[] {

return relations.map((relation) => {

let foreignKeyOwner = ''

if (
relation.type === 'many_to_one' ||
relation.type === 'one_to_one'
) {
foreignKeyOwner =
relation.sourceModel
}

if (
relation.type === 'one_to_many'
) {
foreignKeyOwner =
relation.targetModel
}

if (
relation.type === 'many_to_many'
) {
foreignKeyOwner =
'junction_table'
}

return {
sourceModel:
relation.sourceModel,

sourceField:
relation.sourceField,

targetModel:
relation.targetModel,

targetField:
relation.targetField,

relationType:
relation.type,

foreignKeyOwner,

isValid:
Boolean(
relation.sourceModel &&
relation.sourceField &&
relation.targetModel &&
relation.targetField
)
}
})
}
