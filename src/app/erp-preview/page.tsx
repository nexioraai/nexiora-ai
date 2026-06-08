export default async function ERPPreviewPage() {
const res = await fetch('http://localhost:3000/api/erp-test', {
cache: 'no-store',
});

const erp = await res.json();

return (
<div style={{ padding: '40px' }}>
<h1>{erp.name}</h1>

<div
style={{
display: 'grid',
gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
gap: '20px',
marginTop: '30px',
}}
>
{erp.modules.map((module: string) => (
<div
key={module}
style={{
border: '1px solid #ddd',
borderRadius: '12px',
padding: '20px',
}}
>
<h3>{module}</h3>
</div>
))}
</div>
</div>
);
}