export function generatePrismaSchema(erp: any) {

console.log(
'RELATIONS_COUNT',
erp.relations?.length || 0
)

const relationsByModel:
Record<string, any[]> = {}

for (
const relation of erp.relations || []
) {

if (
!relationsByModel[
relation.sourceModel
]
) {
relationsByModel[
relation.sourceModel
] = []
}

relationsByModel[
relation.sourceModel
].push(relation)
}

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

const fields =
model.fields
.map(
(field: string) =>
`${field} String?`
)
.join('\n')

const modelRelations =
relationsByModel[
model.name
] || []

console.log(
'MODEL',
model.name
)

console.log(
JSON.stringify(
modelRelations,
null,
2
)
)

const relationFields =
modelRelations
.map((relation: any) => {

if (
relation.type ===
'many_to_one'
) {

return `
${relation.inverseField}
${relation.targetModel}?
`
}

if (
relation.type ===
'one_to_many'
) {

return `
${relation.inverseField}
${relation.targetModel}[]
`
}

if (
relation.type ===
'one_to_one'
) {

return `
${relation.inverseField}
${relation.targetModel}?
`
}

return ''
})
.join('\n')

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
