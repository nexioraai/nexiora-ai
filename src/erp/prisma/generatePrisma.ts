import { buildRelationGraph } from '@/erp/relations/buildRelationGraph'
import { normalizeRelations } from '@/erp/relations/normalizeRelations'
import { buildPrismaRelations } from '@/erp/relations/buildPrismaRelations'
import { buildPrismaField } from './buildPrismaField'

export function generatePrismaSchema(
erp: any
) {

let schema = `
generator client {
provider = "prisma-client-js"
}

datasource db {
provider = "sqlite"
url = env("DATABASE_URL")
}
`

const relationGraph =
buildRelationGraph(
erp.relations || []
)

const normalizedGraph =
normalizeRelations(
relationGraph
)

for (const model of erp.models || []) {

const fields =
(model.fields || [])
.map(
(field: any) =>
buildPrismaField(field)
)
.join('\n')

const relationFields =
buildPrismaRelations(
model.name,
normalizedGraph
)

schema += `
model ${model.name} {

id String @id @default(cuid())

${fields}

${relationFields}

createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

}
`
}

return schema
}
