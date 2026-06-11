
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
const data = await prisma.leave_requests.findMany()
return NextResponse.json(data)
}
