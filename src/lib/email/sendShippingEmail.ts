import 'server-only';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Adresse d'envoi : domaine Resend par defaut (fonctionne sans verif domaine).
// A remplacer par notifications@nexiora.ca une fois le domaine verifie chez Resend.
const FROM_ADDRESS = 'onboarding@resend.dev';

interface ShippingEmailParams {
  to: string;            // email du client
  customerName?: string; // nom du client (optionnel)
  shopName: string;      // nom de la boutique (expediteur affiche)
  trackingNumber: string;
}

/**
 * Envoie au client un email "commande expediee" avec son numero de suivi.
 * L'email s'affiche au nom de la boutique du marchand.
 * Renvoie true si l'envoi a reussi, false sinon (jamais d'exception propagee).
 */
export async function sendShippingEmail(params: ShippingEmailParams): Promise<boolean> {
  const { to, customerName, shopName, trackingNumber } = params;
  if (!to || !trackingNumber || !shopName) return false;
  if (!process.env.RESEND_API_KEY) {
    console.error('sendShippingEmail: RESEND_API_KEY absente');
    return false;
  }

  const greeting = customerName ? `Bonjour ${customerName},` : 'Bonjour,';

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="font-size: 20px; font-weight: 700;">Votre commande a été expédiée 📦</h2>
      <p style="font-size: 15px; line-height: 1.6;">${greeting}</p>
      <p style="font-size: 15px; line-height: 1.6;">
        Bonne nouvelle ! Votre commande chez <strong>${shopName}</strong> vient de partir.
      </p>
      <div style="background: #f5f5f5; border-radius: 12px; padding: 16px 20px; margin: 20px 0;">
        <p style="font-size: 13px; color: #666; margin: 0 0 4px;">Numéro de suivi</p>
        <p style="font-size: 18px; font-weight: 700; margin: 0; letter-spacing: 0.5px;">${trackingNumber}</p>
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #555;">
        Vous pouvez suivre votre colis avec ce numéro sur un service de suivi comme
        <a href="https://www.17track.net/en" style="color: #E07040;">17track.net</a>.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #555;">Merci pour votre confiance,<br/>L'équipe ${shopName}</p>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: `${shopName} <${FROM_ADDRESS}>`,
      to: [to],
      subject: 'Votre commande a été expédiée 📦',
      html,
    });
    if (error) {
      console.error('sendShippingEmail: erreur Resend', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('sendShippingEmail: exception', e);
    return false;
  }
}
