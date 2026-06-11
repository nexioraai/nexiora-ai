import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import ErpApp from './ErpApp'

type Props = { params: Promise<{ slug: string }> }

async function fetchErp(slug: string) {
  const { data, error } = await supabaseAdmin
    .from('erps')
    .select('*')
    .eq('slug', slug)
    .single()
  if (error || !data) return null
  return data
}

export default async function ErpPage({ params }: Props) {
  const { slug } = await params
  const erp = await fetchErp(slug)
  if (!erp) notFound()
  return <ErpApp erp={erp} />
}
