import { NextRequest, NextResponse } from 'next/server'
import { generateFromPrompt } from '@/erp/generator/generateFromPrompt'
import { writePrismaSchema } from '@/erp/prisma/writePrismaSchema'
import { writePages } from '@/erp/generator/writePages'
import { writeApiRoutes } from '@/erp/generator/writeApiRoutes'
import { cleanupGenerated } from '@/erp/generator/cleanupGenerated'
import { writeAgentPages } from '@/erp/generator/writeAgentPages'

export async function GET(req: NextRequest) {

const prompt =
req.nextUrl.searchParams.get('prompt') || ''

const erp =
await generateFromPrompt(prompt)

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
erp
})
}
