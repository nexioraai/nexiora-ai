import { NextRequest, NextResponse } from 'next/server'
import { supabase as supabaseAnon } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { anthropic } from '@/lib/anthropic'

async function getEmail(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null
  const { data, error } = await supabaseAnon.auth.getUser(token)
  if (error || !data.user?.email) return null
  return data.user.email
}

// Vérifie que l'email est bien le PDG (propriétaire) de cet ERP
async function isOwner(email: string, erpSlug: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('erps').select('owner_email').eq('slug', erpSlug).single()
  return !!data && data.owner_email === email
}

// POST : générer une analyse IA stratégique (PDG UNIQUEMENT)

// GET : récupérer le dernier rapport stocké (PDG uniquement)
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('erp_slug')
  if (!slug) return NextResponse.json({ error: 'erp_slug requis' }, { status: 400 })
  const email = await getEmail(req)
  if (!email || !(await isOwner(email, slug))) {
    return NextResponse.json({ error: 'Réservé au PDG' }, { status: 403 })
  }
  const { data } = await supabaseAdmin
    .from('erp_analysis_cache').select('*').eq('erp_slug', slug).single()
  if (!data) return NextResponse.json({ report: null })
  return NextResponse.json({ report: data.report, recordCount: data.record_count, generatedAt: data.generated_at })
}

export async function POST(req: NextRequest) {
  const email = await getEmail(req)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { erp_slug } = body
  if (!erp_slug) return NextResponse.json({ error: 'erp_slug requis' }, { status: 400 })

  // Sécurité : seul le PDG accède aux analyses stratégiques
  if (!(await isOwner(email, erp_slug))) {
    return NextResponse.json({ error: "Analyses réservées au PDG" }, { status: 403 })
  }

  // Récupérer le blueprint (pour connaître l'activité) + toutes les données
  const { data: erp } = await supabaseAdmin
    .from('erps').select('blueprint, business_name').eq('slug', erp_slug).single()

  const { data: records } = await supabaseAdmin
    .from('erp_records')
    .select('module_name, data, scope, created_at')
    .eq('erp_slug', erp_slug)
    .order('created_at', { ascending: false })
    .limit(1000)

  const recordCount = records?.length || 0

  // Si pas assez de données, on le signale clairement
  if (recordCount === 0) {
    return NextResponse.json({
      report: {
        summary: "Pas encore de données à analyser. Saisissez des produits, ventes ou mouvements de stock pour obtenir des prédictions.",
        ruptures: [],
        bestsellers: [],
        slow: [],
        investments: [],
      },
      recordCount: 0,
    })
  }

  const businessName = erp?.business_name || 'Entreprise'
  const modules = (erp?.blueprint?.modules || []).map((m: any) => m.name).join(', ')

  // Prompt d'analyste stratégique : on demande un JSON strict
  const prompt = `Tu es un analyste stratégique expert en gestion d'entreprise et supply chain. Analyse les données réelles de cette entreprise et produis un rapport stratégique destiné UNIQUEMENT au PDG.

Entreprise : ${businessName}
Modules : ${modules}
Nombre d'enregistrements : ${recordCount}

Données (extraits récents) :
${JSON.stringify((records || []).slice(0, 200), null, 1)}

Analyse ces données et réponds UNIQUEMENT avec un objet JSON valide (aucun texte avant ou après, pas de balises markdown), dans cette structure exacte :
{
  "summary": "synthèse stratégique en 2-3 phrases, en français, ton direct et actionnable",
  "ruptures": [{"produit": "nom", "jours_estimes": nombre, "urgence": "haute|moyenne|basse", "conseil": "action concrète"}],
  "bestsellers": [{"produit": "nom", "raison": "pourquoi il performe"}],
  "slow": [{"produit": "nom", "raison": "pourquoi il stagne"}],
  "investments": [{"produit": "nom", "recommandation": "investir plus|maintenir|réduire", "justification": "courte raison"}]
}

Si les données sont insuffisantes pour une catégorie, renvoie un tableau vide pour celle-ci. Base-toi uniquement sur les données fournies. Sois concret et orienté décision. Réponds en français.`

  let report: any = null
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = msg.content
      .map((b: any) => (b.type === 'text' ? b.text : ''))
      .join('')
      .replace(/```json|```/g, '')
      .trim()
    report = JSON.parse(text)
  } catch (e) {
    return NextResponse.json({ error: "L'analyse IA a échoué. Réessayez." }, { status: 500 })
  }

  // Sauvegarde du rapport pour affichage instantané + cron quotidien
  try {
    await supabaseAdmin.from('erp_analysis_cache').upsert({
      erp_slug, report, record_count: recordCount, generated_at: new Date().toISOString(),
    })
  } catch {}

  return NextResponse.json({ report, recordCount })
}
