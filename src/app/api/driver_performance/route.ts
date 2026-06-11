
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
const data = await prisma.driver_performance.findMany()
return NextResponse.json(data)
}
