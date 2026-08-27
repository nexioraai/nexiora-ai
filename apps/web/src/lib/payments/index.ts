import 'server-only';
import type { PaymentProvider } from './types';
import { stripeProvider } from './stripe';
import { STRIPE_CONNECT_SUPPORTED_COUNTRIES } from './countries';

const providers: Record<string, PaymentProvider> = {
  stripe: stripeProvider,
};

export function getProvider(name: string | null | undefined): PaymentProvider {
  const key = name || 'stripe';
  const provider = providers[key];
  if (!provider) {
    throw new Error(`Provider de paiement inconnu : ${key}`);
  }
  return provider;
}

/**
 * P0-3.9.7 — Country-aware (Section 9 de la Feuille de Route Maître).
 * Détermine, selon le pays, quel provider de paiement est réellement
 * disponible — jamais une assignation universelle à Stripe.
 *
 * Utilise STRIPE_CONNECT_SUPPORTED_COUNTRIES (`./countries.ts`) — distincte
 * de STRIPE_SHIPPING_COUNTRIES (qui ne couvre que la livraison acheteur,
 * pas l'onboarding marchand Stripe Connect, et inclut des pays où Connect
 * n'est pas disponible — vérifié par test, ex. le Tchad y figure).
 *
 * Ne reçoit volontairement que `country` — pas de `context`/`product` :
 * aucune décision réelle de ce module ne dépend aujourd'hui d'autre chose
 * que du pays (le choix "ce site a-t-il besoin d'un paiement" est déjà
 * tranché en amont, avant même l'appel à cette fonction). Ajouter des
 * paramètres non lus serait une fausse extensibilité — à ajouter le jour
 * où un second provider introduit une vraie décision sur ces axes.
 *
 * Retourne `null` (jamais un provider inventé) si aucun provider connu
 * n'est disponible pour ce pays — au moment de la rédaction, seul Stripe
 * existe ; un futur provider (ex. national tchadien) s'ajoutera à cette
 * résolution sans changer sa forme.
 */
export function resolvePaymentProvider(params: { country: string | null | undefined }): string | null {
  const { country } = params;
  if (country && STRIPE_CONNECT_SUPPORTED_COUNTRIES.includes(country as (typeof STRIPE_CONNECT_SUPPORTED_COUNTRIES)[number])) {
    return 'stripe';
  }
  return null;
}

export type { PaymentProvider } from './types';
