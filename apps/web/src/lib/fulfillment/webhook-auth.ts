import 'server-only';
import { timingSafeEqual } from 'crypto';

// ============================================================
// LOT I (audit Mode 3 global, fournisseurs/financier/webhooks) — F-I-1.
//
// Cause racine (avant ce fichier) : les routes webhooks/printful et
// webhooks/gelato vérifiaient chacune leur secret via
// `if (expectedSecret) { ... }` — si la variable d'environnement
// PRINTFUL_WEBHOOK_SECRET/GELATO_WEBHOOK_SECRET n'était pas définie (env
// mal configuré, nouvel environnement, valeur supprimée par erreur), AUCUNE
// vérification n'avait lieu du tout : n'importe qui pouvait POSTer un
// événement de statut fournisseur arbitraire. Fail-open, jamais observable
// (aucune erreur, aucun log). Même classe de bug que les crons
// `process.env.CRON_SECRET && ...` déjà identifiée et corrigée ailleurs
// dans ce dépôt (voir pod-reconciliation/route.ts) — jamais corrigée ici
// avant ce lot.
//
// Recherche effectuée avant ce correctif (documentation officielle
// fournisseur) : ni Printful ni Gelato (API Order utilisée par ce projet,
// order.gelatoapis.com — distincte du produit "GelatoConnect" à JWT/iss,
// non utilisé ici) ne documentent de signature HMAC cryptographique pour
// leurs webhooks. Gelato documente explicitement un secret configurable par
// le marchand au moment de la création du webhook (en-tête HTTP OU
// paramètre de requête, au choix). Ce module accepte les deux transports
// (en-tête `X-Webhook-Secret` prioritaire, `?secret=` en repli pour
// rétro-compatibilité avec une configuration déjà en place côté dashboard
// fournisseur) — mais rend désormais la vérification INCONDITIONNELLE :
// aucun secret configuré côté serveur = requête TOUJOURS rejetée, jamais un
// comportement permissif silencieux.
// ============================================================

/** Comparaison à temps constant (évite un canal auxiliaire de timing sur la
 * comparaison caractère par caractère d'une chaîne JS classique — défense en
 * profondeur, le secret n'étant de toute façon jamais la seule barrière
 * contre un abus réel, voir vérification croisée côté route Printful). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Vérifie le secret d'un webhook fournisseur. Fail-closed : si
 * `expectedSecret` est absent/vide (variable d'environnement non définie),
 * la fonction renvoie TOUJOURS false — jamais de bypass silencieux.
 */
export function verifyWebhookSecret(req: Request, expectedSecret: string | undefined): boolean {
  if (!expectedSecret) return false;
  const url = new URL(req.url);
  const provided = req.headers.get('x-webhook-secret') || url.searchParams.get('secret');
  if (!provided) return false;
  return safeEqual(provided, expectedSecret);
}
