
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
const data = await prisma.equipment_service_history.findMany()
return NextResponse.json(data)
}
