import { generateBlueprint } from './generateBlueprint'
import { normalizeBlueprint } from '@/erp/contracts/normalizeBlueprint'
import { validateBlueprint } from '@/erp/contracts/validateBlueprint'

export async function generateFromPrompt(
prompt: string
) {

const raw =
await generateBlueprint(prompt)

const blueprint =
normalizeBlueprint(raw)

validateBlueprint(blueprint)

return blueprint
}
