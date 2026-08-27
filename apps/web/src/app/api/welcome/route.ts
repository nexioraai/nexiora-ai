import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAuthenticatedUser } from '@/lib/auth/require-authenticated-user';
import { consommerJeton } from '@/lib/rate-limit/rateLimit';

const resend = new Resend(process.env.RESEND_API_KEY);

// ============================================================
// LOT 6 -- CETTE ROUTE ETAIT UN RELAIS D'E-MAIL LIBRE.
//
// Etat d'origine : `POST { email }`, aucune authentification, aucune limite.
// N'importe qui pouvait faire partir, depuis `no-reply@deribfy.com`, un
// courrier signe Deribfy vers UNE ADRESSE DE SON CHOIX, en boucle. Deux
// dommages distincts : le bombardement d'une victime, et l'usure de la
// reputation d'expedition du domaine -- celle-la ne se repare pas vite.
//
// LA LIMITE DE DEBIT SEULE N'AURAIT PAS SUFFI. Elle aurait borne le volume
// sans toucher au fond : l'appelant designait toujours sa victime. La
// correction retire L'ENTREE elle-meme.
//
//   1. IDENTITE — `requireAuthenticatedUser`. Le parcours reel n'est pas
//      casse : `login/page.tsx` appelle cette route JUSTE APRES un
//      `signInWithPassword` reussi ; la session est deja en main, il ne
//      manquait que l'en-tete. Ce n'est donc pas une authentification
//      arbitraire ajoutee a un parcours visiteur, c'est la reconnaissance
//      d'une session qui existait deja.
//
//   2. DESTINATAIRE DERIVE DU JETON. `email` n'est plus lu depuis le corps.
//      Le courrier ne peut plus partir que vers le proprietaire du compte
//      appelant : viser un tiers est devenu impossible, pas seulement limite.
//
//   3. LIMITE PAR COMPTE. Le perimetre naturel est l'utilisateur, pas le
//      site (il n'y en a pas) ni le monde entier -- un compteur global
//      laisserait un seul abuseur priver tous les nouveaux inscrits de leur
//      e-mail. Trois par heure : le parcours legitime n'en declenche qu'UN
//      par compte dans toute sa vie (`profiles.welcomed`).
//
//   4. LA PANNE FERME. `consommerJeton` rend 503 si le compteur ne repond
//      pas ; aucun e-mail ne part alors. C'est l'inverse exact du defaut
//      demontre sur `blog/generate`.
// ============================================================

const PLAFOND_PAR_HEURE = 3;

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (!auth.ok) return auth.response;

    const jeton = await consommerJeton({
      type: 'welcome_email_sent',
      siteId: null,
      perimetreSupplementaire: { colonne: 'details->>user_id', valeur: auth.userId },
      fenetreMs: 60 * 60 * 1000,
      plafond: PLAFOND_PAR_HEURE,
      message: 'Trop de demandes, reessayez plus tard.',
      details: { user_id: auth.userId },
    });
    if (!jeton.ok) {
      return NextResponse.json({ success: false, error: jeton.erreur }, { status: jeton.statut });
    }

    const email = auth.email;

    await resend.emails.send({
      from: 'Deribfy <no-reply@deribfy.com>',
      to: email,
      subject: 'Bienvenue chez Deribfy 🎉 / Welcome to Deribfy 🎉',
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1208;">
          <h1 style="font-size:24px;font-weight:800;margin:0 0 24px;background:linear-gradient(135deg,#d97a4f,#c0612d);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Deribfy</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Bonjour,</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Votre compte Deribfy est activé. Décrivez votre idée, et notre IA génère en quelques secondes votre site vitrine, boutique en ligne ou dropshipping.</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Une question ? Écrivez-nous à <a href="mailto:contact@deribfy.com" style="color:#d97a4f;">contact@deribfy.com</a>, nous répondons sous 24h.</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">À très vite,<br/>L'équipe Deribfy</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hi,</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Your Deribfy account is now active. Describe your idea, and our AI generates your showcase site, online store, or dropshipping in seconds.</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Questions? Email us at <a href="mailto:contact@deribfy.com" style="color:#d97a4f;">contact@deribfy.com</a>, we reply within 24h.</p>
          <p style="font-size:15px;line-height:1.6;margin:0;">See you soon,<br/>The Deribfy team</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
