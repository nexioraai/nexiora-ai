
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
const data = await prisma.price_list_lines.findMany()
return NextResponse.json(data)
}
