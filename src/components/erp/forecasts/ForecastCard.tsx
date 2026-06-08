type Props = {
title: string
forecast: string
confidence: string
risk: string
}

export default function ForecastCard({
title,
forecast,
confidence,
risk
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
Forecast
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

<div
style={{
fontSize: '30px',
fontWeight: 'bold',
marginTop: '16px'
}}
>
{forecast}
</div>

<div style={{ marginTop: '12px' }}>
Confidence: {confidence}
</div>

<div style={{ marginTop: '8px' }}>
Risk: {risk}
</div>

</div>
)
}
