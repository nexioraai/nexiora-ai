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

  async createCheckout(accountId, siteSlug, items, successUrl, cancelUrl) {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: items.map((i) => ({
          price_data: {
            currency: i.currency.toLowerCase(),
            product_data: { name: i.name },
            unit_amount: Math.round(i.priceNumber * 100),
          },
          quantity: i.quantity,
        })),
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
      { stripeAccount: accountId }
    );
    return { url: session.url ?? '', orderId: session.id };
  },

  async getStatus(accountId) {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(accountId);
    return { ready: account.charges_enabled === true };
  },
};
