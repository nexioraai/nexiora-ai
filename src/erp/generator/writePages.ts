import fs from 'fs'
import path from 'path'

export function writePages(erp: any) {
console.log('WRITE PAGES CALLED')

console.log(
JSON.stringify(
erp.modules,
null,
2
)
)
const baseDir = path.join(
process.cwd(),
'src/app/generated'
)

fs.mkdirSync(baseDir, { recursive: true })

erp.modules.forEach((module: any) => {

const pageDir = path.join(
baseDir,
module.name
)

const newDir = path.join(
baseDir,
module.name,
'new'
)

fs.mkdirSync(pageDir, {
recursive: true
})

fs.mkdirSync(newDir, {
recursive: true
})

const fieldsString =
module.fields
.map((f: string) => `'${f}'`)
.join(',\n')

fs.writeFileSync(
path.join(pageDir, 'page.tsx'),
`
import CrudTable from '@/components/erp/CrudTable'

export default function Page() {
return (
<CrudTable
title="${module.name}"
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
Nouveau ${module.name}
</h1>
</div>
)
}
`
)

})

return true
}
