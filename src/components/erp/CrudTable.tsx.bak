'use client'

import { useEffect, useState } from 'react'
import CrudForm from './CrudForm'

type Props = {
title: string
fields: string[]
}

export default function CrudTable({
title,
fields
}: Props) {

const [rows, setRows] = useState<any[]>([])
console.log("ROWS =", rows)

useEffect(() => {
load()
}, [])

async function load() {
const res = await fetch(`/api/${title}`)
const data = await res.json(); alert(JSON.stringify(data)); console.log("DATA =", data);
setRows(data); console.log("AFTER_SETROWS")
}

return (
<div className="p-6">

<h1 className="text-3xl font-bold mb-6">
{title}
</h1>

<CrudForm
title={title}
fields={fields}
/>

<div className="overflow-auto border rounded">

<table className="w-full">

<thead>
<tr>

{fields.map(field => (
<th
key={field}
className="border-b p-3 text-left"
>
{field}
</th>
))}

<th className="border-b p-3">
Actions
</th>

</tr>
</thead>

<tbody>

{rows.map((row, index) => (
<tr key={index}>

{fields.map(field => (
<td
key={field}
className="p-3 border-b"
>
{row[field]}
</td>
))}

<td className="p-3 border-b">
Modifier
</td>

</tr>
))}

</tbody>

</table>

</div>

</div>
)
}
