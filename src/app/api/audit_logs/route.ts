
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
const data = await prisma.audit_logs.findMany()
return NextResponse.json(data)
}
