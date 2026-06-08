import fs from 'fs'
import path from 'path'
import { generatePrismaSchema } from './generatePrisma'

export function writePrismaSchema(erp: any) {

console.log('WRITE PRISMA CALLED')

const schema =
generatePrismaSchema(erp)

console.log(schema)

fs.writeFileSync(
path.join(
process.cwd(),
'prisma/generated.prisma'
),
schema
)

console.log('PRISMA FILE WRITTEN')

return true
}
