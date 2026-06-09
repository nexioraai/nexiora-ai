export type ERPBlueprint = {
name: string

modules: {
name: string
fields: string[]

relations?: {
field: string
target: string
type: string
}[]
}[]

dashboard?: string[]

reports?: string[]

automations?: string[]

agents?: string[]

workflows?: string[]
}
