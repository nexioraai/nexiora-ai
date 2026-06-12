import { Relation } from '../contracts/Relation'

export interface ERPModel {
name: string
fields: string[]
}

export interface ERPTenant {
module: string
key: string
manager?: string
}

export interface ERPBlueprint {
name?: string

tenant?: ERPTenant | null

modules?: {
name: string
fields: string[]
relations?: Relation[]
}[]

models: ERPModel[]

relations: Relation[]

dashboard?: string[]

reports?: string[]

automations?: string[]

agents?: string[]

workflows?: string[]
}
