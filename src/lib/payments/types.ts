import 'server-only';

export interface CartItem {
  id: string;
  name: string;
  priceNumber: number;
  currency: string;
  quantity: number;
}

export interface OnboardingResult {
  url: string;
  accountId: string;
}

export interface CheckoutResult {
  url: string;
  orderId: string;
}

export interface PaymentProvider {
  createOnboarding(siteSlug: string, returnUrl: string): Promise<OnboardingResult>;
  createCheckout(
    accountId: string,
    siteSlug: string,
    items: CartItem[],
    successUrl: string,
    cancelUrl: string
  ): Promise<CheckoutResult>;
  getStatus(accountId: string): Promise<{ ready: boolean }>;
}
