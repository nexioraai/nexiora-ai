
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
const data = await prisma.supplier_pricing.findMany()
return NextResponse.json(data)
}
