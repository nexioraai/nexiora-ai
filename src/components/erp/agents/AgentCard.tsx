type Props = {
name: string
status: string
tasks: string
performance: string
}

export default function AgentCard({
name,
status,
tasks,
performance
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
display: 'flex',
justifyContent: 'space-between',
alignItems: 'center'
}}
>

<h3
style={{
fontSize: '20px',
fontWeight: 'bold'
}}
>
{name}
</h3>

<div
style={{
fontSize: '12px',
padding: '6px 10px',
borderRadius: '999px',
background: '#052E16',
color: '#22C55E'
}}
>
{status}
</div>

</div>

<div style={{ marginTop: '18px' }}>
Tasks Today: {tasks}
</div>

<div style={{ marginTop: '8px' }}>
Performance: {performance}
</div>

</div>
)
}
