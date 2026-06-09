
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
const data = await prisma.shift_schedules.findMany()
return NextResponse.json(data)
}
