import { ERPBlueprint } from './Blueprint'

const VALID_TYPES = [
'id',
'string',
'int',
'float',
'boolean',
'datetime'
]

export function validateBlueprint(
blueprint: ERPBlueprint
) {

if (!blueprint.models?.length) {
throw new Error('No models found')
}

for (const model of blueprint.models) {

if (!model.name) {
throw new Error(
'Model missing name'
)
}

for (const field of model.fields) {

if (!field.name) {
throw new Error(
`Field missing name in ${model.name}`
)
}

if (!field.type) {
throw new Error(
`Field missing type in ${model.name}.${field.name}`
)
}

if (
!VALID_TYPES.includes(
field.type
)
) {
throw new Error(
`Invalid field type: ${field.type}`
)
}

}

}

return true
}
