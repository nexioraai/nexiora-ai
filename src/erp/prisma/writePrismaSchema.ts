import fs from 'fs'
import path from 'path'
import { generatePrismaSchema } from './generatePrisma'

export function writePrismaSchema(erp: any) {

const schema =
generatePrismaSchema(erp)

const prismaDir =
path.join(
process.cwd(),
'prisma'
)

fs.mkdirSync(prismaDir, {
recursive: true
})
console.log('WRITE PRISMA CALLED')

fs.writeFileSync(
path.join(
prismaDir,
'schema.prisma'
),
schema
)

console.log(
'SCHEMA PATH:',
path.join(
prismaDir,
'schema.prisma'
)
)

console.log(
'SCHEMA SIZE:',
schema.length
)

return true
}
