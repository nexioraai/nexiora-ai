import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email manquant' }, { status: 400 });
    }

    await resend.emails.send({
      from: 'Woorri <no-reply@woorri.com>',
      to: email,
      subject: 'Bienvenue chez Woorri 🎉 / Welcome to Woorri 🎉',
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1208;">
          <h1 style="font-size:24px;font-weight:800;margin:0 0 24px;background:linear-gradient(135deg,#d97a4f,#c0612d);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Woorri</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Bonjour,</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Votre compte Woorri est activé. Décrivez votre idée, et notre IA génère en quelques secondes votre site vitrine, boutique en ligne ou dropshipping.</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Une question ? Écrivez-nous à <a href="mailto:contact@woorri.com" style="color:#d97a4f;">contact@woorri.com</a>, nous répondons sous 24h.</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">À très vite,<br/>L'équipe Woorri</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hi,</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Your Woorri account is now active. Describe your idea, and our AI generates your showcase site, online store, or dropshipping in seconds.</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Questions? Email us at <a href="mailto:contact@woorri.com" style="color:#d97a4f;">contact@woorri.com</a>, we reply within 24h.</p>
          <p style="font-size:15px;line-height:1.6;margin:0;">See you soon,<br/>The Woorri team</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
