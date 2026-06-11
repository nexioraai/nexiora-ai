
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
const data = await prisma.pricing_tiers.findMany()
return NextResponse.json(data)
}
