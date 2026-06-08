import ERPStatCard from '@/components/erp/ERPStatCard'

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
gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
gap: '20px'
}}
>

<ERPStatCard
title="Revenue"
value="$124,500"
change="+12.4%"
/>

<ERPStatCard
title="Cash Flow"
value="$48,200"
change="+8.1%"
/>

<ERPStatCard
title="Customers"
value="1,284"
change="+24"
/>

<ERPStatCard
title="Inventory Value"
value="$312,000"
change="+3.8%"
/>

</div>

</div>
)
}
