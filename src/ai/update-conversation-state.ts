import { state } from './conversation-state'
import { BusinessUnderstanding } from './business-understanding'

export function updateConversationState(
understanding: BusinessUnderstanding
) {

if (understanding.activity) {
state.activity = understanding.activity
}

if (understanding.goal) {
state.goal = understanding.goal
}

if (
understanding.goal === 'erp' &&
!understanding.scope
) {
state.step = 'scope'
}
else {
state.step = 'generate'
}

return state
}
