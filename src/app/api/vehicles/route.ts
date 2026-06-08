import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
const body = await req.json()

const vehicle = await prisma.vehicle.create({
data: {
plate: body.plate,
brand: body.brand,
model: body.model,
owner: body.owner,
},
})

return NextResponse.json(vehicle)
}

export async function GET() {
const vehicles = await prisma.vehicle.findMany({
orderBy: {
id: 'desc',
},
})

return NextResponse.json(vehicles)
}
