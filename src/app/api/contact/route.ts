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
      from: 'no-reply@nexiora.ca',
      to: merchantEmail,
      replyTo: email,
      subject: 'New message from ' + name + ' — ' + site.name,
      html: '<h2>New contact message</h2><p><strong>From:</strong> ' + name + ' (' + email + ')</p><p><strong>Site:</strong> ' + site.name + '</p><hr /><p>' + message.replace('\n', '<br />') + '</p>',
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
