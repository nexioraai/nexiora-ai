export function normalizeBlueprint(data: any) {

const modules = data.modules || []

return {
modules,

models: modules.map((m: any) => ({
name: m.name,
fields: m.fields || []
})),

relations: modules.flatMap(
(m: any) => m.relations || []
)
}
}
