import { supabaseAdmin } from '@/lib/supabase-admin'

// Écrit une ligne dans le journal d'activité (qui, quoi, quand).
// Ne bloque jamais l'action principale en cas d'erreur.
export async function logActivity(
  erpSlug: string,
  actorEmail: string,
  action: string,
  detail?: string
) {
  try {
    await supabaseAdmin.from('erp_activity_log').insert({
      erp_slug: erpSlug,
      actor_email: actorEmail,
      action,
      detail: detail || null,
    })
  } catch {
    // silencieux : un échec de log ne doit jamais casser l'action
  }
}
