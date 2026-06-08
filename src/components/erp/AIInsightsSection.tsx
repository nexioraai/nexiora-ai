import AIInsightCard from './AIInsightCard'

export default function AIInsightsSection() {
return (
<div style={{ marginTop: '40px' }}>

<h2
style={{
fontSize: '28px',
fontWeight: 'bold',
marginBottom: '20px'
}}
>
AI Insights
</h2>

<div
style={{
display: 'grid',
gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))',
gap: '20px'
}}
>

<AIInsightCard
title="Low Stock Alert"
description="CAT320D hydraulic pumps will run out in 12 days based on current sales velocity."
/>

<AIInsightCard
title="Revenue Opportunity"
description="Mining customers increased purchases by 18% this month."
/>

<AIInsightCard
title="Payment Risk"
description="3 customers have invoices overdue by more than 30 days."
/>

</div>

</div>
)
}
