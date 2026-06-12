import { NextRequest, NextResponse } from 'next/server'

import { generateFromPrompt } from '@/erp/generator/generateFromPrompt'
import { generateSeedData } from '@/erp/generator/generateSeedData'
import { analyzeBusiness } from '@/ai/business-understanding'
import { getNextQuestion } from '@/ai/question-engine'
import { activityScopes } from '@/ai/activity-scopes'

import { supabase as supabaseAnon } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

// true = court-circuite le check needsMoreInfo (genere directement).
const BYPASS_UNDERSTANDING = true

function generateSlug(name: string): string {
  return (
    (name || 'erp')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') +
    '-' +
    Date.now()
  )
}

export async function POST(req: NextRequest) {
  try {
    // --- Securite : Bearer token (comme /api/chat) ---
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: missing Bearer token' }, { status: 401 })
    }
    const { data: authData, error: authError } = await supabaseAnon.auth.getUser(token)
    if (authError || !authData.user || !authData.user.email) {
      return NextResponse.json({ error: 'Unauthorized: invalid token' }, { status: 401 })
    }
    const owner_email = authData.user.email

    const body = await req.json()
    const prompt = body.prompt || body.message || ''
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const understanding = analyzeBusiness(prompt)

    if (!BYPASS_UNDERSTANDING && understanding.missing.length > 0) {
      return NextResponse.json({
        success: true,
        needsMoreInfo: true,
        question: getNextQuestion(understanding),
        understanding,
      })
    }

    const availableModules =
      activityScopes[understanding.activity || 'general_business'] || []
    const selectedModules = availableModules

    const erp = await generateFromPrompt(prompt, selectedModules)

    if (!erp) {
      return NextResponse.json({ success: false, error: 'ERP generation failed' }, { status: 500 })
    }

    // --- Stockage en base (PAS de fichiers : marche sur Vercel) ---
    const businessName =
      (erp as any).businessName || understanding.activity || 'ERP'
    const slug = generateSlug(businessName)

    const { error } = await supabaseAdmin.from('erps').insert({
      slug,
      business_name: businessName,
      prompt,
      blueprint: erp,
      selected_modules: selectedModules,
      owner_email,
    })

    if (error) {
      console.error('SUPABASE ERROR (erps):', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // --- Pré-remplissage des données décrites par l'utilisateur (seed) ---
    try {
      const seed = await generateSeedData(prompt, erp)
      if (Array.isArray(seed) && seed.length > 0) {
        const rows = seed
          .filter((r: any) => r && r.module_name && r.data)
          .map((r: any) => ({
            erp_slug: slug,
            module_name: r.module_name,
            data: r.data,
            owner_email,
            scope: null,
          }))
        if (rows.length > 0) {
          const { error: seedErr } = await supabaseAdmin.from('erp_records').insert(rows)
          if (seedErr) console.error('SEED INSERT ERROR:', seedErr)
        }
      }
    } catch (e) {
      console.error('SEED GENERATION ERROR:', e)
    }

    return NextResponse.json({ success: true, slug, selectedModules, erp })
  } catch (error) {
    console.error('GENERATOR API ERROR:', error)
    return NextResponse.json({ success: false, error: 'Failed to generate ERP.' }, { status: 500 })
  }
}
