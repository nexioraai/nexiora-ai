import {
BusinessUnderstanding
} from './business-understanding'

import {
analyzeActivity
} from './business-analyzer'

import {
moduleLabels
} from './module-labels'

export function getNextQuestion(
data: BusinessUnderstanding
): string {

if (
data.missing.includes('goal')
) {
return `
Que souhaitez-vous créer ?

• Site web
• Application mobile
• Système de gestion
• Les trois
`
}

if (
data.missing.includes('scope')
) {

const analysis =
analyzeActivity(
data.activity || 'general_business'
)

const choices =
analysis.modules
.map(
item =>
`• ${moduleLabels[item] || item}`
)
.join('\n')

return `
Que souhaitez-vous gérer ?

${choices}

• Tout gérer
`
}

return 'Prêt à générer.'
}
