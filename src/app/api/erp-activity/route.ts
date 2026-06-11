import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// GET : journal d'activité d'un ERP (200 dernières lignes)
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('erp_slug')
  if (!slug) return NextResponse.json({ error: 'erp_slug requis' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('erp_activity_log')
    .select('*')
    .eq('erp_slug', slug)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data || [] })
}
