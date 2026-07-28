import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)
const resend = new Resend(process.env.RESEND_API_KEY || '')

export async function POST(req: NextRequest) {
  try {
    const { slug, name, email, message } = await req.json()

    if (!slug || !name || !email || !message) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const { data: site, error: siteErr } = await supabase
      .from('sites')
      .select('name, contact')
      .eq('slug', slug)
      .single()

    if (siteErr || !site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    }

    const merchantEmail = site.contact?.email
    if (!merchantEmail) {
      return NextResponse.json({ error: 'No contact email configured' }, { status: 400 })
    }

    await resend.emails.send({
      from: 'no-reply@woorri.com',
      to: merchantEmail,
      replyTo: email,
      subject: name + ' — ' + email + ' — ' + site.name,
      html: '<div style="font-family:sans-serif;max-width:600px;margin:0 auto">' +
        '<h2 style="color:#111">New message via ' + site.name + '</h2>' +
        '<div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0">' +
        '<p style="margin:0 0 8px"><strong>Name:</strong> ' + name + '</p>' +
        '<p style="margin:0 0 8px"><strong>Email:</strong> <a href="mailto:' + email + '">' + email + '</a></p>' +
        '</div>' +
        '<div style="padding:16px 0;white-space:pre-wrap">' + message.replace('\n', '<br />') + '</div>' +
        '<hr style="border:none;border-top:1px solid #eee" />' +
        '<p style="color:#888;font-size:12px">Reply directly to this email to respond to ' + name + '.</p>' +
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
