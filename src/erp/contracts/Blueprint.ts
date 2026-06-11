import { Relation } from './Relation'

export interface ERPField {
name: string

type:
| 'id'
| 'string'
| 'int'
| 'float'
| 'boolean'
| 'datetime'

required?: boolean
unique?: boolean
}

export interface ERPModel {
name: string
fields: ERPField[]
}

export interface ERPBlueprint {
models: ERPModel[]
relations?: Relation[]
}
