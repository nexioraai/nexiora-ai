export default function ERPDashboard() {
return (
<div
style={{
minHeight: '100vh',
background: '#0A0F1C',
color: 'white',
padding: '40px'
}}
>

<h1
style={{
fontSize: '42px',
fontWeight: 'bold',
marginBottom: '30px'
}}
>
Nexiora ERP AI
</h1>

<div
style={{
display: 'grid',
gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
gap: '20px'
}}
>

{[
'Revenue',
'Cash Flow',
'AI Insights',
'Predictions',
'Agents Running',
'Automations',
'Alerts',
'Tasks'
].map(card => (

<div
key={card}
style={{
background: '#111827',
padding: '24px',
borderRadius: '18px',
border: '1px solid #1F2937'
}}
>
<h2>{card}</h2>

<p
style={{
opacity: 0.6,
marginTop: '10px'
}}
>
Coming Soon
</p>

</div>

))}

</div>

</div>
)
}
