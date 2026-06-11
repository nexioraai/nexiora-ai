import { buildRelations } from './buildRelations'

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

for (const model of erp.models || []) {

const fields =
(model.fields || [])
.map(
(field: string) =>
`${field} String?`
)
.join('\n')

const relationFields =
buildRelations(
model.name,
erp.relations || []
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
