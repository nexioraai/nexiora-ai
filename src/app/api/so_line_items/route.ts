
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
const data = await prisma.so_line_items.findMany()
return NextResponse.json(data)
}
