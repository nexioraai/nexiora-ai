import 'server-only';

export interface CartItem {
  id: string;
  name: string;
  priceNumber: number;
  currency: string;
  quantity: number;
  customDesignUrl?: string;
  customDesignPosition?: Record<string, number>;
  customDesigns?: { url: string; placement: string; position: Record<string, number> }[];
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
    cancelUrl: string,
    shippingFlat: number,
    applicationFeeAmount?: number,
    /**
     * Nonce d'idempotence fourni par le client (persistant cote navigateur,
     * partage entre onglets) -- un rejeu du meme nonce avec des parametres
     * identiques renvoie la MEME session Stripe au lieu d'en creer une
     * nouvelle. Absent (undefined) : comportement historique inchange,
     * chaque appel cree une session distincte.
     */
    checkoutNonce?: string,
    /**
     * Remise promo, en unite monetaire (pas en centimes), DEJA validee et
     * recalculee cote serveur par checkout/route.ts -- jamais une valeur
     * transmise par le navigateur. 0 ou absent = aucune remise.
     */
    promoDiscount?: number
  ): Promise<CheckoutResult>;
  getStatus(accountId: string): Promise<{ ready: boolean }>;
  /** Rembourse un paiement (avec reverse transfer vers le marchand). */
  refundPayment(paymentIntentId: string): Promise<{ id: string; status: string | null; amount: number }>;
}
