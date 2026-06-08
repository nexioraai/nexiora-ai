import AgentCard from './agents/AgentCard'

export default function AIAgentsSection() {
return (
<div style={{ marginTop: '40px' }}>

<h2
style={{
fontSize: '28px',
fontWeight: 'bold',
marginBottom: '20px'
}}
>
AI Agents
</h2>

<div
style={{
display: 'grid',
gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))',
gap: '20px'
}}
>

<AgentCard
name="Sales Agent"
status="Active"
tasks="24"
performance="98%"
/>

<AgentCard
name="Inventory Agent"
status="Active"
tasks="18"
performance="96%"
/>

<AgentCard
name="Finance Agent"
status="Active"
tasks="12"
performance="99%"
/>

<AgentCard
name="Procurement Agent"
status="Active"
tasks="9"
performance="95%"
/>

<AgentCard
name="CEO Agent"
status="Active"
tasks="4"
performance="100%"
/>

</div>

</div>
)
}
