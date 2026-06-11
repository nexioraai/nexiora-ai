
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
const data = await prisma.customs_entries.findMany()
return NextResponse.json(data)
}
