import 'server-only';
import Stripe from 'stripe';

/**
 * Client Stripe — UTILISER UNIQUEMENT CÔTÉ SERVEUR.
 * Initialisation paresseuse (lazy) : le client n'est créé qu'au premier
 * appel réel, jamais au chargement du module. Évite que le build échoue
 * quand la clé n'est pas encore disponible dans l'environnement.
 */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY manquante dans les variables d\'environnement');
  }

  _stripe = new Stripe(stripeSecretKey);
  return _stripe;
}
