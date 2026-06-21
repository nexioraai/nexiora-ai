import 'server-only';
import type { PaymentProvider } from './types';
import { stripeProvider } from './stripe';

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

export type { PaymentProvider } from './types';
