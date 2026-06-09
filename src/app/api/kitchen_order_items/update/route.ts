
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
const body = await req.json()

const { id, ...data } = body

const item = await prisma.kitchen_order_items.update({
where: { id },
data
})

return NextResponse.json(item)
}
