export function generatePrismaSchema(erp: any) {

let schema = ``

erp.modules.forEach((module: any) => {

schema += `
model ${module.name} {
id String @id @default(cuid())

${module.fields
.map((field: string) =>
`${field} String?`
)
.join('\n')}

createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
}
`
})

return schema
}
