import { anthropic } from '@/lib/anthropic'
import { ERPBlueprint } from '../types/erp-blueprint'

export async function generateBlueprint(
prompt: string
): Promise<ERPBlueprint> {

const response = await anthropic.messages.create({
model: 'claude-sonnet-4-6',
max_tokens: 2500,
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

return JSON.parse(clean)
}
