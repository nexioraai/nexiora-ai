type Props = {
title: string
description: string
}

export default function AIInsightCard({
title,
description
}: Props) {
return (
<div
style={{
background:
'linear-gradient(180deg,#111827 0%,#0B1220 100%)',
border: '1px solid #1E293B',
borderRadius: '24px',
padding: '24px'
}}
>
<div
style={{
fontSize: '12px',
letterSpacing: '0.15em',
textTransform: 'uppercase',
color: '#60A5FA'
}}
>
AI Insight
</div>

<h3
style={{
fontSize: '20px',
fontWeight: 'bold',
marginTop: '12px'
}}
>
{title}
</h3>

<p
style={{
opacity: 0.7,
marginTop: '10px'
}}
>
{description}
</p>

</div>
)
}
