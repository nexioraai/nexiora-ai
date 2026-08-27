import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAnomaly } from '@/lib/anomaly';

/**
 * Rate-limiter CJ GLOBAL (audit hostile, Phase 1-2) -- répond directement à
 * la question posée à plusieurs reprises : "le throttle est-il réellement
 * global au compte CJ, ou seulement local à une invocation serverless ?"
 *
 * Réponse avant ce fichier : NON, un sleep() mémoire ne survit pas entre
 * deux invocations Vercel séparées (webhook de paiement, cron de
 * réconciliation, route shipping-estimate visiteur, action admin catalogue
 * -- tous des processus indépendants). Ce module corrige cela en réclamant
 * atomiquement le prochain créneau d'appel via une ligne Supabase partagée,
 * réutilisant le même primitif (UPDATE...WHERE...RETURNING) déjà prouvé
 * fiable cette session pour le verrou de claim fulfillment.
 *
 * Câblé au niveau le plus bas (cjFetch, client.ts) : couvre AUTOMATIQUEMENT
 * tout appel CJ présent ou futur, sans dépendre qu'un développeur pense à
 * l'ajouter à chaque nouveau site d'appel.
 */
const CJ_RATE_LIMIT_MS = 1100;
const POLL_INTERVAL_MS = 150;
// Garde-fou : n'attend jamais indéfiniment un créneau, même sous forte
// contention -- un fulfillment ou une requête visiteur ne doit jamais rester
// bloqué à cause du limiteur lui-même.
const MAX_WAIT_MS = 20_000;

/**
 * RÉSILIENCE vs GARANTIE (audit hostile, Phase 3 -- distinction explicitement
 * exigée, pas fusionnée) :
 *   - Un créneau OCCUPÉ (data=[], error=null) n'est PAS une dégradation --
 *     c'est le mécanisme qui fonctionne normalement sous contention réelle,
 *     on réessaie jusqu'à obtenir un créneau (ou timeout de sécurité).
 *   - Une ERREUR Supabase (table absente, réseau, panne) EST une perte réelle
 *     de la garantie globale. Fail-open est conservé délibérément après
 *     analyse, PAS par défaut : fail-closed romprait 100% des appels CJ de
 *     toute la plateforme (fulfillment, tracking, recherche catalogue,
 *     estimation livraison) pour un problème qui, avant ce fichier, n'existait
 *     pas du tout (throttle local, jamais de dépendance Supabase). Un 429
 *     résultant d'une dégradation reste sans risque de corruption
 *     (réconciliation obligatoire déjà prouvée). Mais fail-open silencieux
 *     serait inacceptable -- la perte de garantie doit être OBSERVABLE, pas
 *     juste tolérée. D'où l'alerte ci-dessous, une fois par instance (pas à
 *     chaque appel, pour ne pas noyer checkout_anomalies si la migration
 *     n'est simplement pas encore appliquée).
 */
let hasLoggedUnavailable = false;

export async function acquireCjSlot(): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const threshold = new Date(Date.now() - CJ_RATE_LIMIT_MS).toISOString();
    const { data, error } = await supabaseAdmin
      .from('cj_rate_limiter')
      .update({ last_call_at: new Date().toISOString() })
      .eq('id', 1)
      .lt('last_call_at', threshold)
      .select('id');

    if (error) {
      if (!hasLoggedUnavailable) {
        hasLoggedUnavailable = true;
        console.error('[cj-rate-limiter] Supabase indisponible -- garantie globale suspendue, repli local:', error.message);
        logAnomaly({
          type: 'cj_rate_limiter_unavailable',
          severity: 'warning',
          details: { reason: error.message },
        }).catch(() => {});
      }
      // Dégrade gracieusement plutôt que de bloquer tout appel CJ de la
      // plateforme -- repli sur un délai fixe local (comportement historique
      // préservé), jamais un blocage total pour un problème d'infrastructure
      // annexe au fulfillment lui-même.
      await new Promise((r) => setTimeout(r, CJ_RATE_LIMIT_MS));
      return;
    }
    if (data && data.length > 0) return; // créneau obtenu, réservé pour nous

    // Créneau pas encore libre : quelqu'un d'autre (autre instance, autre
    // route) vient d'appeler CJ récemment -- réessaie après un court délai.
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  // Timeout de sécurité atteint (contention extrême ou ligne singleton
  // absente malgré une table existante -- cf. audit, edge case documenté et
  // accepté : dégrade en délai maximal plutôt qu'un blocage indéfini) : on
  // procède quand même, au pire un 429 peut survenir -- déjà géré sans risque
  // de corruption par la réconciliation obligatoire avant toute création.
}
