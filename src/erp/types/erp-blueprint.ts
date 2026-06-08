export type ERPBlueprint = {
name: string

modules: {
name: string
fields: string[]
}[]

dashboard?: string[]
reports?: string[]
}
