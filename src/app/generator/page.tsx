'use client';

import { useState } from 'react';

export default function GeneratorPage() {
const [prompt, setPrompt] = useState('');
const [erp, setErp] = useState<any>(null);

async function generate() {
const res = await fetch(
'/api/generator?prompt=' + encodeURIComponent(prompt)
)

const data = await res.json()

console.log('DATA =', data)

setErp(data.erp)
}

return (
<div style={{ padding: '40px' }}>
<h1>Nexiora ERP Generator</h1>

<input
value={prompt}
onChange={(e) => setPrompt(e.target.value)}
placeholder="Ex: Je veux un système de gestion pour un hôpital"
style={{
width: '500px',
padding: '12px',
marginTop: '20px',
}}
/>

<button
onClick={generate}
style={{
marginLeft: '10px',
padding: '12px 20px',
}}
>
Générer
</button>

{erp && (
<div style={{ marginTop: '40px' }}>
<h2>{erp.name}</h2>

<div
style={{
display: 'flex',
gap: '10px',
flexWrap: 'wrap',
}}
>
{erp.modules.map((module: any) => (
<div
key={module.name}
style={{
border: '1px solid #ddd',
borderRadius: '12px',
padding: '20px',
}}
>
<strong>{module.name}</strong>

<div style={{ marginTop: '10px' }}>
{module.fields.join(', ')}
</div>
</div>
))}
<h3 style={{ marginTop: '40px' }}>
Pages générées
</h3>

{erp?.pages?.map((page: any) => (

<div
key={page.route}
style={{
border: '1px solid #ddd',
padding: '12px',
marginTop: '10px',
borderRadius: '10px'
}}
>
<strong>{page.name}</strong>

<div>{page.route}</div>

<div style={{ marginTop: '8px', fontSize: '12px' }}>

<div>Create: {page?.navigation?.create || '-'}</div>
<div>List: {page?.navigation?.list || '-'}</div>
<div>Edit: {page?.navigation?.edit || '-'}</div>
</div>
</div>
))}
</div>
</div>
)}
</div>
);
}