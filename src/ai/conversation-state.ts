export interface ConversationState {

activity: string | null

goal: string | null

selectedModules: string[]

step:
| 'activity'
| 'goal'
| 'scope'
| 'generate'
}

export const state: ConversationState = {

activity: null,

goal: null,

selectedModules: [],

step: 'activity'
}
