export function normalizeBlueprint(data: any) {

const modules = data.modules || []

return {
modules,

models: modules.map((m: any) => ({

name: m.name,

fields:
(m.fields || []).map(
(field: any) => ({

name:
field.name || field,

type:
field.type || 'string',

required:
field.required || false,

unique:
field.unique || false

})
)

})),

relations: modules.flatMap(
(m: any) => m.relations || []
)

}
}
