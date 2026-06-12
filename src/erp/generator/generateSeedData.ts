import { anthropic } from '@/lib/anthropic'

type SeedRecord = { module_name: string; data: Record<string, any> }

export async function generateSeedData(prompt: string, blueprint: any): Promise<SeedRecord[]> {
  const modules = (blueprint?.modules || []).map((m: any) => ({
    name: m.name,
    fields: (m.fields || []).slice(0, 30),
  }))

  const sys = [
    'You extract CONCRETE INITIAL DATA from a business description to pre-fill an ERP.',
    '',
    'ABSOLUTE RULES:',
    '- Generate ONLY data explicitly described by the user. If the user says "3 schools with 14, 12 and 10 classrooms", create exactly 3 establishments and 14+12+10 classrooms. Do NOT invent students, teachers, or extra entities the user never mentioned.',
    '- If the user lists named items (subjects, products, sites, branches), create one record per named item, using their EXACT names.',
    '- Respect relations: when a child record references a parent (e.g. a classroom belongs to "School 1"), fill the parent-reference field with the SAME identifier value you used as the parent record id. Use simple readable ids like "ETB1", "ETB2".',
    '- Use the SAME LANGUAGE as the description for all values.',
    '- Fill only fields you can infer from the description; leave unknown fields out (do not invent phone numbers, emails, addresses unless given).',
    '- If NOTHING concrete is described for a module, return no records for it.',
    '',
    'Return ONLY valid JSON (no markdown), an array of records:',
    '[{ "module_name": "establishments", "data": { "establishment_id": "ETB1", "name": "Ecole 1" } }, { "module_name": "classrooms", "data": { "establishment_id": "ETB1", "room_number": "1" } }]',
  ].join('\n')

  const userMsg = [
    'Business description:',
    prompt,
    '',
    'ERP modules and their fields (use these exact module names and field names):',
    JSON.stringify(modules, null, 1),
    '',
    'Extract the concrete initial data described above. Return ONLY the JSON array.',
  ].join('\n')

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: sys,
      messages: [{ role: 'user', content: userMsg }],
    })
    const text = res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('')
    const clean = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim()
    const parsed = JSON.parse(clean)
    if (Array.isArray(parsed)) return parsed
    return []
  } catch (e) {
    console.log('SEED_DATA_ERROR', e)
    return []
  }
}
