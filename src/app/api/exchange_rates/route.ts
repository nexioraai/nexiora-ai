
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
const data = await prisma.exchange_rates.findMany()
return NextResponse.json(data)
}

export async function POST(req: Request) {

const body = await req.json()

const item = await prisma.exchange_rates.create({
data: body
})

return NextResponse.json(item)
}
