import { ERPBlueprint } from './Blueprint'

export function validateBlueprint(
blueprint: ERPBlueprint
) {
if (!blueprint.models?.length) {
throw new Error('No models found')
}

for (const relation of blueprint.relations || []) {

if (!relation.relationName)
throw new Error('Missing relationName')

if (!relation.type)
throw new Error('Missing relation type')

if (!relation.sourceModel)
throw new Error('Missing sourceModel')

if (!relation.sourceField)
throw new Error('Missing sourceField')

if (!relation.targetModel)
throw new Error('Missing targetModel')

if (!relation.targetField)
throw new Error('Missing targetField')

if (!relation.inverseField)
throw new Error('Missing inverseField')
}

return true
}
