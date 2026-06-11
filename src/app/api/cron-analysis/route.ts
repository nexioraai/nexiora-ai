import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { anthropic } from '@/lib/anthropic'

export const maxDuration = 60

// Analyse un seul ERP et sauvegarde le rapport dans le cache
async function analyzeErp(erp: any) {
  const { data: records } = await supabaseAdmin
    .from('erp_records')
    .select('module_name, data, scope, created_at')
    .eq('erp_slug', erp.slug)
    .order('created_at', { ascending: false })
    .limit(1000)

  const recordCount = records?.length || 0
  if (recordCount === 0) return { slug: erp.slug, skipped: true }

  const businessName = erp.business_name || 'Entreprise'
  const modules = (erp.blueprint?.modules || []).map((m: any) => m.name).join(', ')

  const prompt = 'Tu es un analyste strategique expert en gestion d\'entreprise et supply chain. Analyse les donnees reelles de cette entreprise et produis un rapport strategique destine UNIQUEMENT au PDG.\n\n' +
    'Entreprise : ' + businessName + '\nModules : ' + modules + '\nNombre d\'enregistrements : ' + recordCount + '\n\n' +
    'Donnees (extraits recents) :\n' + JSON.stringify((records || []).slice(0, 200), null, 1) + '\n\n' +
    'Analyse ces donnees et reponds UNIQUEMENT avec un objet JSON valide (aucun texte avant ou apres, pas de balises markdown), dans cette structure exacte :\n' +
    '{\n  "summary": "synthese strategique en 2-3 phrases, en francais, ton direct et actionnable",\n  "ruptures": [{"produit": "nom", "jours_estimes": nombre, "urgence": "haute|moyenne|basse", "conseil": "action concrete"}],\n  "bestsellers": [{"produit": "nom", "raison": "pourquoi il performe"}],\n  "slow": [{"produit": "nom", "raison": "pourquoi il stagne"}],\n  "investments": [{"produit": "nom", "recommandation": "investir plus|maintenir|reduire", "justification": "courte raison"}]\n}\n\n' +
    'Si les donnees sont insuffisantes pour une categorie, renvoie un tableau vide. Base-toi uniquement sur les donnees fournies. Reponds en francais.'

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = msg.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('').replace(/\`\`\`json|\`\`\`/g, '').trim()
    const report = JSON.parse(text)
    await supabaseAdmin.from('erp_analysis_cache').upsert({
      erp_slug: erp.slug, report, record_count: recordCount, generated_at: new Date().toISOString(),
    })
    return { slug: erp.slug, ok: true }
  } catch (e) {
    return { slug: erp.slug, error: true }
  }
}

// GET : declenche par Vercel Cron chaque jour
export async function GET(req: NextRequest) {
  // Securite : seul Vercel (avec le bon secret) peut declencher
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: erps } = await supabaseAdmin
    .from('erps').select('slug, business_name, blueprint').limit(100)

  const results = []
  for (const erp of erps || []) {
    results.push(await analyzeErp(erp))
  }

  return NextResponse.json({ done: true, analyzed: results.length, results })
}
