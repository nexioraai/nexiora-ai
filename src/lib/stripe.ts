import 'server-only';
import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY!;

if (!stripeSecretKey) {
  throw new Error('STRIPE_SECRET_KEY manquante dans .env.local');
}

/**
 * Client Stripe singleton — UTILISER UNIQUEMENT CÔTÉ SERVEUR.
 * Clé secrète : ne jamais exposer côté client.
 */
export const stripe = new Stripe(stripeSecretKey);
