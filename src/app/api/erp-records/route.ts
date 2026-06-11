import { NextRequest, NextResponse } from 'next/server'
import { supabase as supabaseAnon } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getEmail(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null
  const { data, error } = await supabaseAnon.auth.getUser(token)
  if (error || !data.user?.email) return null
  return data.user.email
}

// GET : lister les enregistrements d'un module
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('erp_slug')
  const moduleName = req.nextUrl.searchParams.get('module')
  if (!slug || !moduleName) {
    return NextResponse.json({ error: 'erp_slug et module requis' }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin
    .from('erp_records')
    .select('*')
    .eq('erp_slug', slug)
    .eq('module_name', moduleName)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ records: data || [] })
}

// POST : ajouter un enregistrement
export async function POST(req: NextRequest) {
  const email = await getEmail(req)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { erp_slug, module_name, data } = body
  if (!erp_slug || !module_name) {
    return NextResponse.json({ error: 'erp_slug et module_name requis' }, { status: 400 })
  }
  const { data: inserted, error } = await supabaseAdmin
    .from('erp_records')
    .insert({ erp_slug, module_name, data: data || {}, owner_email: email })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record: inserted })
}

// PATCH : modifier un enregistrement
export async function PATCH(req: NextRequest) {
  const email = await getEmail(req)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, data } = body
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const { data: updated, error } = await supabaseAdmin
    .from('erp_records')
    .update({ data: data || {} })
    .eq('id', id)
    .eq('owner_email', email)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record: updated })
}

// DELETE : supprimer un enregistrement
export async function DELETE(req: NextRequest) {
  const email = await getEmail(req)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('erp_records')
    .delete()
    .eq('id', id)
    .eq('owner_email', email)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
