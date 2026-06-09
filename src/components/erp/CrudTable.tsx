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
const [editingRow, setEditingRow] = useState<any>(null)
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

{editingRow && (
<div className="border p-4 rounded mb-6">
<h2>Modification</h2>
<input className="border p-2 w-full mb-2" value={editingRow.company_name || ""} onChange={(e)=>setEditingRow({...editingRow,company_name:e.target.value})} />
<input className="border p-2 w-full mb-2" value={editingRow.contact_name || ""} onChange={(e)=>setEditingRow({...editingRow,contact_name:e.target.value})} />
<input className="border p-2 w-full mb-2" value={editingRow.phone || ""} onChange={(e)=>setEditingRow({...editingRow,phone:e.target.value})} />
<input className="border p-2 w-full mb-2" value={editingRow.email || ""} onChange={(e)=>setEditingRow({...editingRow,email:e.target.value})} />
<input className="border p-2 w-full mb-2" value={editingRow.city || ""} onChange={(e)=>setEditingRow({...editingRow,city:e.target.value})} />
<input className="border p-2 w-full mb-2" value={editingRow.country || ""} onChange={(e)=>setEditingRow({...editingRow,country:e.target.value})} />
<button onClick={async ()=>{ await fetch("/api/customers/update",{ method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(editingRow) }); setEditingRow(null); load(); }}>Mettre à jour</button>
</div>
)}


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
<button onClick={() => setEditingRow(row)}>
Modifier
</button>
<span> / </span>
<button onClick={async () => {
await fetch('/api/customers/delete', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ id: row.id })
})
load()
}}>
Supprimer
</button>
</td>

</tr>
))}

</tbody>

</table>

</div>

</div>
)
}
