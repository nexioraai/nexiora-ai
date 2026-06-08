type Props = {
title: string
value: string
change?: string
}

export default function ERPStatCard({
title,
value,
change
}: Props) {
return (
<div
style={{
background:
'linear-gradient(180deg,#111827 0%,#0F172A 100%)',
border: '1px solid #1F2937',
borderRadius: '20px',
padding: '24px'
}}
>
<div
style={{
fontSize: '14px',
opacity: 0.7
}}
>
{title}
</div>

<div
style={{
fontSize: '34px',
fontWeight: 'bold',
marginTop: '12px'
}}
>
{value}
</div>

{change && (
<div
style={{
marginTop: '10px',
color: '#22C55E'
}}
>
{change}
</div>
)}
</div>
)
}
