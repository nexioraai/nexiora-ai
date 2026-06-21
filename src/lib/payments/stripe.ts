import 'server-only';
import { getStripe } from '@/lib/stripe';
import type { PaymentProvider } from './types';

export const stripeProvider: PaymentProvider = {
  async createOnboarding(siteSlug, returnUrl) {
    const stripe = getStripe();
    const account = await stripe.accounts.create({ type: 'standard' });
    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    return { url: link.url, accountId: account.id };
  },

  async createCheckout(accountId, siteSlug, items, successUrl, cancelUrl, shippingFlat) {
    const stripe = getStripe();

    const lineItems = items.map((i) => ({
      price_data: {
        currency: i.currency.toLowerCase(),
        product_data: { name: i.name },
        unit_amount: Math.round(i.priceNumber * 100),
        tax_behavior: 'exclusive' as const,
      },
      quantity: i.quantity,
    }));

    const currency = (items[0]?.currency || 'cad').toLowerCase();
    const shippingOptions =
      shippingFlat > 0
        ? [
            {
              shipping_rate_data: {
                type: 'fixed_amount' as const,
                fixed_amount: { amount: Math.round(shippingFlat * 100), currency },
                display_name: 'Livraison',
                tax_behavior: 'exclusive' as const,
              },
            },
          ]
        : undefined;

    const baseParams = {
      mode: 'payment' as const,
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      ...(shippingOptions ? { shipping_options: shippingOptions } : {}),
    };

    // Tente avec calcul automatique des taxes (Stripe Tax côté compte connecté).
    // Si Stripe Tax n'est pas activé sur ce compte, on retombe sans taxe.
    try {
      const session = await stripe.checkout.sessions.create(
        {
          ...baseParams,
          automatic_tax: { enabled: true },
          billing_address_collection: 'required',
        },
        { stripeAccount: accountId }
      );
      return { url: session.url ?? '', orderId: session.id };
    } catch (e: any) {
      const session = await stripe.checkout.sessions.create(baseParams, { stripeAccount: accountId });
      return { url: session.url ?? '', orderId: session.id };
    }
  },

  async getStatus(accountId) {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(accountId);
    return { ready: account.charges_enabled === true };
  },
};
