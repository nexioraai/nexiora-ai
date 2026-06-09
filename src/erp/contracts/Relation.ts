export interface Relation {
relationName: string

type:
| 'one_to_one'
| 'one_to_many'
| 'many_to_one'
| 'many_to_many'

sourceModel: string
sourceField: string

targetModel: string
targetField: string

inverseField: string
}
