import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { logAnomaly } from '@/lib/anomaly'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)
const resend = new Resend(process.env.RESEND_API_KEY || '')

// ---- M1-02 ----
// Le corps de l'e-mail etait construit par concatenation de chaines, avec
// `name`, `email` et `site.name` inseres BRUTS. La route est publique et non
// authentifiee : n'importe qui pouvait donc injecter du HTML dans un message
// envoye au marchand DEPUIS le domaine de la plateforme, donc signe DKIM par
// deribfy.com -- du hameconnage parfaitement credible, arrivant dans une
// boite de reception qui a toutes les raisons de faire confiance a l'expediteur.
// `email` etait de surcroit insere dans un attribut (`href="mailto:..."`), ou
// un guillemet suffit a sortir de l'attribut.
const ESC: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};
function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

// Bornes : le contenu part dans un e-mail ET dans `messages`. Sans borne, un
// seul envoi pouvait y deposer un volume arbitraire.
const MAX = { name: 120, email: 254, message: 5000 };   // 254 = RFC 5321
// Validation volontairement permissive : il ne s'agit pas de juger la validite
// d'une adresse (seul un envoi le prouve) mais d'ecarter ce qui ne peut pas en
// etre une, et surtout ce qui contiendrait un saut de ligne -- vecteur
// d'injection d'en-tetes.
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

export async function POST(req: NextRequest) {
  try {
    const { slug, name, email, message } = await req.json()

    if (!slug || !name || !email || !message) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    if (typeof name !== 'string' || typeof email !== 'string' || typeof message !== 'string') {
      return NextResponse.json({ error: 'Invalid fields' }, { status: 400 })
    }
    if (name.length > MAX.name || email.length > MAX.email || message.length > MAX.message) {
      return NextResponse.json({ error: 'Field too long' }, { status: 400 })
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const { data: site, error: siteErr } = await supabase
      .from('sites')
      .select('id, name, contact')
      .eq('slug', slug)
      .single()

    if (siteErr || !site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    }

    const merchantEmail = site.contact?.email
    if (!merchantEmail) {
      return NextResponse.json({ error: 'No contact email configured' }, { status: 400 })
    }

    // ---- M1-02 : borne de debit ----
    // Route publique declenchant un envoi d'e-mail reel : sans borne, un
    // visiteur peut bombarder la boite du marchand, epuiser le quota Resend et
    // degrader la reputation du domaine expediteur. Meme mecanisme DB-native
    // que promo/validate -- aucune infrastructure ajoutee.
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()
    // LOT 6 -- `error` N'ETAIT PAS LU, DONC LA BORNE S'OUVRAIT EN PANNE.
    // PostgREST rend `count: null` quand la requete echoue ; `(null ?? 0) >= 20`
    // vaut false, et l'e-mail partait quand meme -- au moment precis ou la base
    // flanchait. Meme defaut que `blog/generate`, demontre par execution au
    // LOT 6. Le client de cette route reste le sien : seule la lecture de
    // `error` change.
    const { count: recent, error: erreurCompteur } = await supabase
      .from('checkout_anomalies')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', site.id)
      .eq('type', 'contact_message_sent')
      .gte('created_at', oneHourAgo)
    if (erreurCompteur) {
      return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
    }
    if ((recent ?? 0) >= 20) {
      return NextResponse.json({ error: 'Too many messages, try again later' }, { status: 429 })
    }
    await logAnomaly({ type: 'contact_message_sent', severity: 'info', siteId: site.id, details: { slug } })

    await resend.emails.send({
      from: 'no-reply@deribfy.com',
      to: merchantEmail,
      replyTo: email,
      // Sujet : texte pur, jamais interprete comme HTML -- mais les sauts de
      // ligne y sont un vecteur d'injection d'en-tetes, deja ecartes par EMAIL_RE
      // et neutralises ici pour `name`.
      subject: name.replace(/[\r\n]+/g, ' ') + ' — ' + email + ' — ' + site.name,
      html: '<div style="font-family:sans-serif;max-width:600px;margin:0 auto">' +
        '<h2 style="color:#111">New message via ' + esc(site.name) + '</h2>' +
        '<div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0">' +
        '<p style="margin:0 0 8px"><strong>Name:</strong> ' + esc(name) + '</p>' +
        '<p style="margin:0 0 8px"><strong>Email:</strong> <a href="mailto:' + esc(email) + '">' + esc(email) + '</a></p>' +
        '</div>' +
        '<div style="padding:16px 0;white-space:pre-wrap">' + esc(message).replace(/\n/g, '<br />') + '</div>' +
        '<hr style="border:none;border-top:1px solid #eee" />' +
        '<p style="color:#888;font-size:12px">Reply directly to this email to respond to ' + esc(name) + '.</p>' +
        '</div>',
    })

    await supabase.from('messages').insert({
      site_slug: slug,
      name,
      email,
      message,
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
