import { anthropic } from '@/lib/anthropic'
import { ERPBlueprint } from '../types/erp-blueprint'

export async function generateBlueprint(
prompt: string
): Promise<ERPBlueprint> {

const response = await anthropic.messages.create({
model: 'claude-sonnet-4-6',
max_tokens: 8000,
messages: [
{
role: 'user',
content: `
You are Nexiora ERP Architect.

Analyze the business description and return ONLY valid JSON.

Format:

{
"name": "ERP Name",
"modules": [
{
"name": "customers",
"fields": [
"name",
"phone",
"email"
]
}
],
"dashboard": [
"revenue",
"customers",
"orders"
],
"reports": [
"sales",
"inventory"
],
"automations": [
"auto_reorder",
"invoice_generation"
],
"agents": [
"sales_agent",
"inventory_agent"
],
"workflows": [
"order_to_cash",
"procure_to_pay"
]
}

Business:

${prompt}
`
}
]
})

const text = response.content
.map((item: any) =>
item.type === 'text'
? item.text
: ''
)
.join('')

const clean = text
.replace(/```json/g, '')
.replace(/```/g, '')
.trim()

console.log("CLAUDE_RESPONSE_START");
console.log(clean);
console.log("CLAUDE_RESPONSE_END");
return JSON.parse(clean)
}
