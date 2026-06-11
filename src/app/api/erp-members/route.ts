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

// Vérifie que l'email est bien l'Admin (créateur) de cet ERP
async function isAdmin(email: string, erpSlug: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('erps')
    .select('owner_email')
    .eq('slug', erpSlug)
    .single()
  return !!data && data.owner_email === email
}

// GET : lister les membres d'un ERP
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('erp_slug')
  if (!slug) return NextResponse.json({ error: 'erp_slug requis' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('erp_members')
    .select('*')
    .eq('erp_slug', slug)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: data || [] })
}

// POST : inviter un membre (ADMIN UNIQUEMENT)
export async function POST(req: NextRequest) {
  const email = await getEmail(req)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { erp_slug, member_email, role, allowed_modules, scope } = body
  if (!erp_slug || !member_email) {
    return NextResponse.json({ error: 'erp_slug et member_email requis' }, { status: 400 })
  }
  if (!(await isAdmin(email, erp_slug))) {
    return NextResponse.json({ error: "Seul le PDG peut gérer les accès" }, { status: 403 })
  }
  const { data, error } = await supabaseAdmin
    .from('erp_members')
    .upsert(
      { erp_slug, member_email, role: role || 'employee', allowed_modules: allowed_modules || [], scope: scope || null, invited_by: email },
      { onConflict: 'erp_slug,member_email' }
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data })
}

// PATCH : modifier un membre (ADMIN UNIQUEMENT)
export async function PATCH(req: NextRequest) {
  const email = await getEmail(req)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, erp_slug, role, allowed_modules, scope } = body
  if (!id || !erp_slug) return NextResponse.json({ error: 'id et erp_slug requis' }, { status: 400 })
  if (!(await isAdmin(email, erp_slug))) {
    return NextResponse.json({ error: "Seul le PDG peut gérer les accès" }, { status: 403 })
  }
  const patch: any = {}
  if (role !== undefined) patch.role = role
  if (allowed_modules !== undefined) patch.allowed_modules = allowed_modules
  if (scope !== undefined) patch.scope = scope

  const { data, error } = await supabaseAdmin
    .from('erp_members')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data })
}

// DELETE : retirer un membre / sortie d'employé (ADMIN UNIQUEMENT)
export async function DELETE(req: NextRequest) {
  const email = await getEmail(req)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  const slug = req.nextUrl.searchParams.get('erp_slug')
  if (!id || !slug) return NextResponse.json({ error: 'id et erp_slug requis' }, { status: 400 })
  if (!(await isAdmin(email, slug))) {
    return NextResponse.json({ error: "Seul le PDG peut gérer les accès" }, { status: 403 })
  }
  const { error } = await supabaseAdmin.from('erp_members').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
