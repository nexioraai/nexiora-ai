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

You are an expert ERP architect — a world-class consultant across ALL industries.

STEP 1 — UNDERSTAND THE BUSINESS DEEPLY before generating:
- Identify the EXACT sector AND its sub-niche (not just "healthcare" but "private dental clinic" vs "public hospital" vs "pharmacy"; not just "commerce" but "food retail" vs "import/export wholesaler" vs "fashion boutique"; not just "school" but "primary school" vs "university").
- Infer the user's real intent and operational needs from their description, even when implicit.
- Consider this sector's critical daily processes, regulatory constraints, key KPIs, common pain points, and workflow particularities.

STEP 2 — GENERATE A SECTOR-EXPERT ERP:
- Modules must be HIGHLY specific to this exact sub-niche, never generic.
- Use the EXACT professional vocabulary of the trade, in the SAME LANGUAGE as the business description (French business => French module names). A hospital has patients/rendez-vous/dossiers_medicaux/lits/pharmacie_interne, NOT customers/products. A school has eleves/classes/notes/emploi_du_temps/enseignants/scolarite. A pharmacy has medicaments/ordonnances/stock_reglemente/dates_peremption.
- Dashboard, reports, automations, agents and workflows must reflect what THIS sector truly monitors (hospital: bed availability, drug expiry; school: attendance, unpaid tuition; wholesaler: container shipments, exchange rates).
- Capture nuances: a surgical clinic needs operating-room scheduling; a pharmacy needs controlled-substance tracking; a distributor needs multi-warehouse logistics.

STEP 3 — DETECT HIERARCHICAL TENANT (system-within-a-system):
- Some businesses manage MULTIPLE INDEPENDENT UNITS that each run as a self-contained sub-system: a network of schools (each school has its own students/teachers/library), a retail chain (each store has its own stock/staff/sales), a hospital group (each hospital), a holding (each subsidiary), a ministry (each regional directorate).
- If and ONLY IF such a container unit exists, identify it and output a top-level "tenant" object:
  - "module": the exact module name representing the container unit (e.g. "ecoles", "magasins", "hopitaux", "filiales").
  - "key": the field other modules use to reference it (e.g. "ecole_id", "magasin_id").
  - "manager": the role that runs ONE unit (e.g. "directeur", "gerant", "responsable").
- If the business is a SINGLE unit (one shop, one clinic), set "tenant" to null.
- This is GENERIC: never assume schools. Detect the container for the ACTUAL sector described.

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
"tenant": { "module": "ecoles", "key": "ecole_id", "manager": "directeur" },
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
