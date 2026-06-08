export type ERPBlueprint = {
name: string

modules: {
name: string
fields: string[]
}[]

dashboard?: string[]

reports?: string[]

automations?: string[]

agents?: string[]

workflows?: string[]
}
