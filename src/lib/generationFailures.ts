import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Enregistre un echec de generation de site (JSON invalide ou rejete par
 * GeneratedSiteSchema) dans une table dediee, verrouillee par RLS -- meme
 * principe que logAnomaly() (checkout_anomalies) mais table separee : un
 * echec de generation n'est pas une anomalie de paiement, les melanger
 * nuirait a la lisibilite d'un futur audit admin. Ne throw jamais : un echec
 * de journalisation ne doit pas casser la reponse d'erreur deja en cours.
 */
export async function logGenerationFailure(params: {
  owner_id?: string | null;
  owner_email?: string | null;
  requested_mode: number | null;
  detected_sector: string;
  failure_type: 'json_parse' | 'schema_validation';
  stop_reason?: string | null;
  zod_issues?: unknown;
  parse_error?: string | null;
  raw_response_tail: string;
  message_excerpt: string;
}): Promise<void> {
  // Filet diagnostique duplique dans les logs (jamais bloquant) : couvre le
  // cas ou l'ecriture DB elle-meme echoue (RLS, contrainte, type), qui ne
  // leve PAS d'exception JS avec le client Supabase -- seul un `catch` ici
  // ne l'aurait jamais detecte (defaut reel trouve en audit : la version
  // precedente ne lisait jamais `error` sur le retour de `.insert()`).
  const diagnosticFallback = () =>
    console.error('[generation_failures] DB indisponible, contenu diagnostique de secours :', JSON.stringify({
      failure_type: params.failure_type,
      detected_sector: params.detected_sector,
      requested_mode: params.requested_mode,
      stop_reason: params.stop_reason ?? null,
      parse_error: params.parse_error ?? null,
      zod_issues: params.zod_issues ?? null,
      raw_response_tail: params.raw_response_tail,
      message_excerpt: params.message_excerpt,
    }));

  try {
    const { error } = await supabaseAdmin.from('generation_failures').insert({
      owner_id: params.owner_id ?? null,
      owner_email: params.owner_email ?? null,
      requested_mode: params.requested_mode,
      detected_sector: params.detected_sector,
      failure_type: params.failure_type,
      stop_reason: params.stop_reason ?? null,
      zod_issues: params.zod_issues ?? null,
      parse_error: params.parse_error ?? null,
      raw_response_tail: params.raw_response_tail,
      message_excerpt: params.message_excerpt,
    });
    if (error) {
      console.error('[generation_failures] insert rejete par la DB:', error.message);
      diagnosticFallback();
    }
  } catch (e) {
    console.error('[generation_failures] insert a leve une exception:', e);
    diagnosticFallback();
  }
}
