import { Relation } from './Relation'

export interface ERPModel {
name: string
fields: string[]
}

export interface ERPBlueprint {
models: ERPModel[]
relations?: Relation[]
}