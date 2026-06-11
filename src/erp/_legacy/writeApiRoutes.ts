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

const dir = path.join(
apiBase,
model.name
)

fs.mkdirSync(dir, {
recursive: true
})

fs.writeFileSync(
path.join(dir, 'route.ts'),
`
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
const data = await prisma.${model.name}.findMany()
return NextResponse.json(data)
}

export async function POST(req: Request) {

const body = await req.json()

const item = await prisma.${model.name}.create({
data: body
})

return NextResponse.json(item)
}
`
)

}

return true
}
