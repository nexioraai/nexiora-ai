import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { site_slug, name, email, subject, message } = body;

    const { error } = await supabase.from('messages').insert({
      site_slug,
      name,
      email,
      subject,
      message,
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Contact error:', error);
    return NextResponse.json({ error: 'Failed to send message.' }, { status: 500 });
  }
}
