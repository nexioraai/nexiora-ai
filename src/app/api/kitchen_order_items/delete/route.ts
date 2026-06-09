
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
const body = await req.json()

await prisma.kitchen_order_items.delete({
where: {
id: body.id
}
})

return NextResponse.json({
success: true
})
}
