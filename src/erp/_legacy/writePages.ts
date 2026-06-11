import fs from 'fs'
import path from 'path'

export function writePages(erp: any) {
console.log('WRITE PAGES CALLED')

console.log(
JSON.stringify(
erp.models,
null,
2
)
)
const baseDir = path.join(
process.cwd(),
'src/app/generated'
)

fs.mkdirSync(baseDir, { recursive: true })

fs.writeFileSync(
path.join(baseDir, "modules.json"),
JSON.stringify(
 erp.models.map((m: any) => m.name),
 null,
 2
)
)

for (const model of erp.models) {

const pageDir = path.join(
baseDir,
model.name
)

const newDir = path.join(
baseDir,
model.name,
'new'
)

fs.mkdirSync(pageDir, {
recursive: true
})

fs.mkdirSync(newDir, {
recursive: true
})

const fieldsString =
model.fields
.map((f: string) => `'${f}'`)
.join(',\n')

fs.writeFileSync(
path.join(pageDir, 'page.tsx'),
`
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="${model.name}"
fields={[
${fieldsString}
]}
/>
)
}
`
)

fs.writeFileSync(
path.join(newDir, 'page.tsx'),
`
export default function NewPage() {
return (
<div className="p-6">
<h1 className="text-2xl font-bold">
Nouveau ${model.name}
</h1>
</div>
)
}
`
)

}

return true
}
