import AutomationCard from './automations/AutomationCard'

export default function AutomationsSection() {
return (
<div style={{ marginTop: '40px' }}>

<h2
style={{
fontSize: '28px',
fontWeight: 'bold',
marginBottom: '20px'
}}
>
Automations Center
</h2>

<div
style={{
display: 'grid',
gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))',
gap: '20px'
}}
>

<AutomationCard
name="Auto Reorder"
status="Running"
executions="42"
successRate="99.2%"
lastRun="2 min ago"
/>

<AutomationCard
name="Invoice Generation"
status="Running"
executions="18"
successRate="100%"
lastRun="5 min ago"
/>

<AutomationCard
name="Payment Reminder"
status="Running"
executions="12"
successRate="98.8%"
lastRun="12 min ago"
/>

<AutomationCard
name="Supplier Follow-up"
status="Running"
executions="7"
successRate="97.5%"
lastRun="25 min ago"
/>

<AutomationCard
name="Customs Clearance Alert"
status="Running"
executions="5"
successRate="100%"
lastRun="40 min ago"
/>

</div>

</div>
)
}
