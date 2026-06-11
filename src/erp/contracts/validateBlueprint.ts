import { ERPBlueprint } from './Blueprint'

export function validateBlueprint(
blueprint: ERPBlueprint
) {

if (!blueprint.models?.length) {
throw new Error('No models found')
}

return true
}