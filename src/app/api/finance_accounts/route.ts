
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
const data = await prisma.finance_accounts.findMany()
return NextResponse.json(data)
}
