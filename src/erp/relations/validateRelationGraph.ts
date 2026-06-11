import { RelationGraphItem } from './buildRelationGraph'

export interface ValidationResult {
valid: boolean
errors: string[]
}

export function validateRelationGraph(
graph: RelationGraphItem[]
): ValidationResult {

const errors: string[] = []

for (const relation of graph) {

if (!relation.sourceModel) {
errors.push('Missing sourceModel')
}

if (!relation.targetModel) {
errors.push('Missing targetModel')
}

if (!relation.sourceField) {
errors.push('Missing sourceField')
}

if (!relation.targetField) {
errors.push('Missing targetField')
}

if (!relation.relationType) {
errors.push('Missing relationType')
}

}

return {
valid: errors.length === 0,
errors
}
}
