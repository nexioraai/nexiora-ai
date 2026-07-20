import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const maxDuration = 120

// Construit la question type depuis le site
function buildQuery(site: any): string {
  const type = site.type || 'entreprise'
  const city = (site.address || '').split(',').slice(-2)[0]?.trim() || (site.area_served || '')
  return city
    ? `Quels sont les meilleurs ${type} à ${city} ? Donne une liste.`
    : `Quels sont les meilleurs ${type} ? Donne une liste.`
}

// Détecte présence + position fiable + extrait dans une réponse texte
function detect(name: string, answer: string) {
  if (!name || !answer) return { appears: false, position: null as number | null, excerpt: null as string | null }
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const nName = norm(name)
  const lines = answer.split('\n')
  // Cherche une liste numérotée : "1. ...", "2. ..."
  for (const line of lines) {
    const m = line.match(/^\s*(\d+)[\.\)]\s*(.+)/)
    if (m && norm(m[2]).includes(nName)) {
      return { appears: true, position: parseInt(m[1]), excerpt: line.trim().slice(0, 300) }
    }
  }
  // Sinon, mention en prose (présent mais sans position fiable)
  if (norm(answer).includes(nName)) {
    const idx = norm(answer).indexOf(nName)
    return { appears: true, position: null, excerpt: answer.slice(Math.max(0, idx - 80), idx + 120).trim() }
  }
  return { appears: false, position: null, excerpt: null }
}

// Appel Perplexity (web temps réel)
async function askPerplexity(query: string): Promise<string | null> {
  const key = process.env.PERPLEXITY_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: query }] }),
    })
    const data = await res.json()
    return data.choices?.[0]?.message?.content || null
  } catch (e) { console.error('Perplexity failed:', e); return null }
}

// Appel ChatGPT avec recherche web
async function askChatGPT(query: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-4o', tools: [{ type: 'web_search_preview' }], input: query }),
    })
    const data = await res.json()
    return data.output_text
      || data.output?.map((o: any) => o.content?.map((c: any) => c.text).join('')).join('')
      || null
  } catch (e) { console.error('ChatGPT failed:', e); return null }
}

export async function GET(req: NextRequest) {
  // Sécurité cron : header secret
  const secret = req.headers.get('authorization')
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: sites } = await supabaseAdmin
    .from('sites').select('slug, name, type, address, area_served').eq('published', true)

  const results: any[] = []
  for (const site of sites || []) {
    const query = buildQuery(site)
    const providers: [string, Promise<string | null>][] = [
      ['perplexity', askPerplexity(query)],
      ['chatgpt', askChatGPT(query)],
    ]
    for (const [provider, p] of providers) {
      const answer = await p
      if (answer === null) continue // clé absente ou échec
      const { appears, position, excerpt } = detect(site.name, answer)
      await supabaseAdmin.from('ai_visibility_checks').insert({
        slug: site.slug, ai_provider: provider, query,
        appears, position, excerpt, raw_response: answer.slice(0, 4000),
      })
      results.push({ slug: site.slug, provider, appears, position })
    }
  }

  return NextResponse.json({ ok: true, checked: results.length, results })
}
