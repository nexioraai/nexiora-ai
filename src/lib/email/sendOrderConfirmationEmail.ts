import 'server-only';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_ADDRESS = 'no-reply@nexiora.ca';

interface OrderConfirmationParams {
  to: string;
  customerName?: string;
  shopName: string;
  orderId: string;
  total: number;
  currency: string;
}

export async function sendOrderConfirmationEmail(params: OrderConfirmationParams): Promise<boolean> {
  const { to, customerName, shopName, orderId, total, currency } = params;
  if (!to || !shopName) return false;
  if (!process.env.RESEND_API_KEY) {
    console.error('sendOrderConfirmationEmail: RESEND_API_KEY absente');
    return false;
  }

  const greeting = customerName ? `Bonjour ${customerName},` : 'Bonjour,';
  const formattedTotal = `${total.toFixed(2)} ${currency.toUpperCase()}`;
  const shortId = orderId.slice(0, 8).toUpperCase();

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="font-size: 20px; font-weight: 700;">Merci pour votre commande &#x2705;</h2>
      <p style="font-size: 15px; line-height: 1.6;">${greeting}</p>
      <p style="font-size: 15px; line-height: 1.6;">
        Votre commande chez <strong>${shopName}</strong> a bien été reçue et est en cours de traitement.
      </p>
      <div style="background: #f5f5f5; border-radius: 12px; padding: 16px 20px; margin: 20px 0;">
        <p style="font-size: 13px; color: #666; margin: 0 0 4px;">Commande</p>
        <p style="font-size: 18px; font-weight: 700; margin: 0;">#${shortId}</p>
        <p style="font-size: 13px; color: #666; margin: 12px 0 4px;">Total</p>
        <p style="font-size: 18px; font-weight: 700; margin: 0;">${formattedTotal}</p>
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #555;">
        Vous recevrez un email avec votre numéro de suivi dès que votre commande sera expédiée.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #555;">Merci pour votre confiance,<br/>L'équipe ${shopName}</p>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: `${shopName} <${FROM_ADDRESS}>`,
      to: [to],
      subject: `Commande confirmée &#x2705; - ${shopName}`,
      html,
    });
    if (error) {
      console.error('sendOrderConfirmationEmail: erreur Resend', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('sendOrderConfirmationEmail: exception', e);
    return false;
  }
}
