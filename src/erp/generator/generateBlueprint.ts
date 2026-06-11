import { anthropic } from '@/lib/anthropic'
import { ERPBlueprint } from '../types/erp-blueprint'

export async function generateBlueprint(
prompt: string,
selectedModules: string[] = []
): Promise<ERPBlueprint> {

const modulesText =
selectedModules.length
?
selectedModules.join("\n")
:
"AUTO"

const response = await anthropic.messages.create({
model: 'claude-sonnet-4-6',
max_tokens: 8000,
messages: [
{
role: 'user',
content: `
You are Nexiora ERP Architect.

You are an expert ERP architect.

Generate industry-specific ERP modules.

Rules:

- Do NOT always generate customers, products, orders and invoices.
- Analyze the business description first.
- Create modules specific to the business.
- Every module must contain realistic business fields.
- Generate between 5 and 15 modules.
- Generate specialized workflows.
- Generate specialized agents.
- Generate specialized automations.

Examples:

Auto Parts Business:
products
inventory
suppliers
purchase_orders
sales_orders
warranties_returns
part_compatibility
caterpillar_models

Restaurant:
menu_items
tables
reservations
kitchen_orders
suppliers
inventory
employees

Import Export:
suppliers
purchase_orders
import_operations
imports_customs
import_logistics
warehouses
exchange_rates

Return ONLY valid JSON.

IMPORTANT:

Every relation MUST contain:

- relationName
- type
- sourceModel
- sourceField
- targetModel
- targetField
- inverseField

Relations using only:
field, target, type

are INVALID.

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
],
"relations": [
{
"relationName": "CustomerOrders",
"type": "one_to_many",
"sourceModel": "customers",
"sourceField": "customer_id",
"targetModel": "sales_orders",
"targetField": "id",
"inverseField": "orders"
}
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

Selected Modules:

${modulesText}

If Selected Modules is not AUTO:

- Generate ONLY those modules
- Do not invent additional modules
- Build the ERP around those modules

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
