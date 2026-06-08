'use client'

import { useState } from 'react'

type Props = {
title: string
fields: string[]
}

export default function CrudForm({
title,
fields
}: Props) {

const [form, setForm] = useState<any>({})

async function save() {

await fetch(`/api/${title}`, {
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify(form)
})

location.reload()
}

return (
<div className="border p-4 rounded mb-6">

{fields.map(field => (
<div key={field} className="mb-3">

<input
placeholder={field}
className="border p-2 w-full"
onChange={(e) =>
setForm({
...form,
[field]: e.target.value
})
}
/>

</div>
))}

<button
onClick={save}
className="border rounded px-4 py-2"
>
Enregistrer
</button>

</div>
)
}
