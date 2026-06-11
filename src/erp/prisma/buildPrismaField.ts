import { ERPField } from '../contracts/Blueprint'

export function buildPrismaField(
field: ERPField
): string {

if (field.type === 'id') {
return `${field.name} String @id @default(cuid())`
}

const typeMap: Record<string, string> = {
string: 'String',
int: 'Int',
float: 'Float',
boolean: 'Boolean',
datetime: 'DateTime'
}

const prismaType =
typeMap[field.type]

let result =
`${field.name} ${prismaType}`

if (!field.required) {
result += '?'
}

if (field.unique) {
result += ' @unique'
}

return result
}
