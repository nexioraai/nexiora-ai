import fs from 'fs'
import path from 'path'

export function writeApiRoutes(erp: any) {

const apiBase = path.join(
process.cwd(),
'src/app/api'
)

fs.mkdirSync(apiBase, {
recursive: true
})

for (const model of erp.models) {

const dir = path.join(apiBase, model.name)
const createDir = path.join(dir, 'create')
const updateDir = path.join(dir, 'update')
const deleteDir = path.join(dir, 'delete')

fs.mkdirSync(dir, { recursive: true })
fs.mkdirSync(createDir, { recursive: true })
fs.mkdirSync(updateDir, { recursive: true })
fs.mkdirSync(deleteDir, { recursive: true })

fs.writeFileSync(
path.join(dir, 'route.ts'),
`
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
const data = await prisma.${model.name}.findMany()
return NextResponse.json(data)
}
`
)

fs.writeFileSync(
path.join(createDir, 'route.ts'),
`
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
const body = await req.json()

const item = await prisma.${model.name}.create({
data: body
})

return NextResponse.json(item)
}
`
)

fs.writeFileSync(
path.join(updateDir, 'route.ts'),
`
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
const body = await req.json()

const { id, ...data } = body

const item = await prisma.${model.name}.update({
where: { id },
data
})

return NextResponse.json(item)
}
`
)

fs.writeFileSync(
path.join(deleteDir, 'route.ts'),
`
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
const body = await req.json()

await prisma.${model.name}.delete({
where: {
id: body.id
}
})

return NextResponse.json({
success: true
})
}
`
)

}

return true
}
