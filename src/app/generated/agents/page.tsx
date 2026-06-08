
export default function AgentsPage() {

const agents = [
  "sales_agent",
  "inventory_agent",
  "finance_agent",
  "customer_support_agent",
  "procurement_agent"
]

return (
<div style={{ padding: 40 }}>
<h1>AI Agents</h1>

{agents.map((agent: string) => (
<div
key={agent}
style={{
border: '1px solid #ddd',
padding: 20,
marginTop: 10,
borderRadius: 10
}}
>
{agent}
</div>
))}
</div>
)
}
