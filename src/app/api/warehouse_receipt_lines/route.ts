
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
const data = await prisma.warehouse_receipt_lines.findMany()
return NextResponse.json(data)
}
