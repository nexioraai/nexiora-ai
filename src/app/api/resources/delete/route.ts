
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
const body = await req.json()

await prisma.resources.delete({
where: {
id: body.id
}
})

return NextResponse.json({
success: true
})
}
