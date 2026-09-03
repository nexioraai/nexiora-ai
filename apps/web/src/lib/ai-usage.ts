import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Enregistre un appel IA facture a Nexiora, rattache a une boutique.
 * NON-BLOQUANT : toute erreur est avalee pour ne jamais casser la generation.
 * @param usage - l'objet `usage` renvoye par anthropic.messages.create (input_tokens / output_tokens)
 */
export async function logAiUsage(params: {
  siteId: string | null | undefined;
  usageType: string; // 'agent' | 'content' | 'curate' | 'enhance' | 'image' | 'blog' | 'marketing' | 'onboarding'
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
}): Promise<void> {
  try {
    await supabaseAdmin.from('ai_usage_log').insert({
      site_id: params.siteId ?? null,
      usage_type: params.usageType,
      model: params.model ?? null,
      input_tokens: params.usage?.input_tokens ?? 0,
      output_tokens: params.usage?.output_tokens ?? 0,
    });
  } catch {
    // silencieux : le tracking ne doit jamais bloquer l'appel principal
  }
}
