import { NextResponse } from 'next/server'
import { generateFromPrompt } from '@/erp/generator/generateFromPrompt'

export async function GET(request: Request) {
const { searchParams } = new URL(request.url)

const prompt = searchParams.get('prompt') || ''

const erp = generateFromPrompt(prompt)

if (!erp) {
return NextResponse.json(
{ error: 'ERP non reconnu' },
{ status: 400 }
)
}

return NextResponse.json(erp)
}