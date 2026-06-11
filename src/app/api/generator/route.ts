import { NextRequest, NextResponse } from 'next/server'

import { generateFromPrompt } from '@/erp/generator/generateFromPrompt'
import { writePrismaSchema } from '@/erp/prisma/writePrismaSchema'
import { writePages } from '@/erp/generator/writePages'
import { writeApiRoutes } from '@/erp/generator/writeApiRoutesV2'
import { cleanupGenerated } from '@/erp/generator/cleanupGenerated'
import { writeAgentPages } from '@/erp/generator/writeAgentPages'

import { analyzeBusiness } from '@/ai/business-understanding'
import { getNextQuestion } from '@/ai/question-engine'
import { activityScopes } from '@/ai/activity-scopes'

export async function GET(req: NextRequest) {

const prompt =
req.nextUrl.searchParams.get('prompt') || ''

const understanding =
analyzeBusiness(prompt)

if (understanding.missing.length > 0) {

return NextResponse.json({
success: true,
needsMoreInfo: true,
question: getNextQuestion(understanding),
understanding
})
}

const availableModules =
activityScopes[
understanding.activity || 'general_business'
] || []

const selectedModules =
understanding.scope === 'full_business'
? availableModules
: availableModules

const erp =
await generateFromPrompt(
prompt,
selectedModules
)

if (!erp) {
return NextResponse.json({
success: false,
error: 'ERP generation failed'
})
}

cleanupGenerated()

writePrismaSchema(erp)
writePages(erp)
writeApiRoutes(erp)
writeAgentPages(erp)

return NextResponse.json({
success: true,
selectedModules,
erp
})
}
