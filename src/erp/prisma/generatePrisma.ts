export function generatePrismaSchema(erp: any) {

let schema = `
generator client {
provider = "prisma-client-js"
}

datasource db {
provider = "sqlite"
url = env("DATABASE_URL")
}
`

for (const model of erp.models) {

const fields = model.fields
.map((field: string) => {

if (
field.endsWith('_id') &&
field !== 'id'
) {
return `${field} String?`
}

return `${field} String?`
})
.join('\n')

schema += `
model ${model.name} {
id String @id @default(cuid())

${fields}

createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
}
`
}

return schema
}
